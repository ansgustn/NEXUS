import os
import sys
import time
import math
import random
import asyncio
from fractions import Fraction
import numpy as np
import cv2
import torch
import av
from aiortc import VideoStreamTrack, AudioStreamTrack

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../scripts'))
from eye_blink_model import BLINK_PROFILE, compute_eye_displacement_template

class AvatarVideoStreamTrack(VideoStreamTrack):
    """
    aiortc VideoStreamTrack for Real-Time AI Avatar (Alternative B: Ultra-High-Fidelity Mode)
    - Strict adherence to rules & user preference:
      1. NO full-image shaking/swaying (100% stationary background)
      2. NO 2D ellipse/graphic overlays
      3. ZERO face distortion / ZERO eye warping / ZERO forehead/glasses bending
      4. 100% Razor-Sharp Original Portrait Quality during IDLE (zero bilinear resampling loss)
      5. Micro sub-pixel natural lip-sync strictly localized to verified mouth coordinates
    """
    kind = "video"

    def __init__(self, figures_map, initial_figure_id='kim-koo', fps=25):
        super().__init__()
        self.fps = fps
        self.time_base = Fraction(1, fps)
        self.figures_map = figures_map
        self.current_figure_id = initial_figure_id
        
        self.device = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')
        print(f"[AvatarVideoStreamTrack] Alternative B Engine Initialized on {self.device} (Target FPS: {self.fps})")

        # Audio sync queue for driving mouth deformation
        self.audio_energy_queue = asyncio.Queue()
        self.current_energy = 0.0
        self.smooth_energy = 0.0

        # State tracking
        self.frame_index = 0
        self.start_time = None
        self.next_time = None

        # Natural Biological Eye Blink State Machine
        self.blink_frame = -1
        self.next_blink_in = random.randint(65, 120)  # frames until next blink (~2.6s ~ 4.8s at 25 FPS)
        self.blink_profile = BLINK_PROFILE  # 5-frame smooth biological eyelid closure
        self.is_double_blink = False
        self.eye_disp_template = None

        # Preload current figure texture tensor on GPU
        self.load_figure(initial_figure_id)

    def load_figure(self, figure_id):
        """Preload figure portrait, maintain aspect ratio, and initialize coordinate grid."""
        if figure_id not in self.figures_map:
            print(f"[AvatarVideoStreamTrack Warning] Figure '{figure_id}' not found, falling back to default.")
            figure_id = list(self.figures_map.keys())[0]

        self.current_figure_id = figure_id
        fig_data = self.figures_map[figure_id]
        img_path = fig_data['image_path']

        img_bgr = cv2.imread(img_path)
        if img_bgr is None:
            raise FileNotFoundError(f"Cannot load portrait image from: {img_path}")

        # Maintain exact native aspect ratio: target_w = 640
        orig_h, orig_w, _ = img_bgr.shape
        target_w = 640
        target_h = int(target_w * (orig_h / float(orig_w)))
        if target_h % 2 != 0:
            target_h += 1

        img_resized = cv2.resize(img_bgr, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
        img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)

        self.w = target_w
        self.h = target_h
        self.pristine_rgb = img_rgb.copy()

        # Convert to RGB float32 CUDA Tensor [1, 3, H, W]
        self.img_tensor = torch.from_numpy(img_rgb).permute(2, 0, 1).unsqueeze(0).float().to(self.device) / 255.0

        # Precompute normalized base grid [-1, 1] on CUDA
        grid_y, grid_x = torch.meshgrid(
            torch.linspace(-1, 1, self.h, device=self.device),
            torch.linspace(-1, 1, self.w, device=self.device),
            indexing='ij'
        )
        self.base_grid = torch.stack((grid_x, grid_y), dim=-1).unsqueeze(0) # [1, H, W, 2]
        self.grid_x = grid_x
        self.grid_y = grid_y

        # Exact verified mouth coordinates in normalized space [-1, 1]
        self.mouth_cy = float(fig_data.get('mouth_cy', -0.05))
        self.mouth_cx = float(fig_data.get('mouth_cx', 0.0))
        self.mouth_scale = float(fig_data.get('mouth_scale', 0.05))

        # Precompute anatomical eye displacement template (2D: disp_x, disp_y)
        self.eye_disp_x, self.eye_disp_y = compute_eye_displacement_template(self.grid_x, self.grid_y, figure_id, self.device)

        print(f"[OK] [AvatarVideoStreamTrack Alt-B] Loaded figure '{figure_id}' ({self.w}x{self.h}) - Anatomical blink template ready.")

    def queue_audio_energy(self, energy_list):
        """Push a list of per-frame audio energy scalars into the video sync queue."""
        # Flush any stale frames from previous speech to guarantee instant start and exact dialogue sync
        flushed_count = 0
        while not self.audio_energy_queue.empty():
            try:
                self.audio_energy_queue.get_nowait()
                flushed_count += 1
            except Exception:
                break

        for e in energy_list:
            self.audio_energy_queue.put_nowait(e)

        print(f"[VIDEO TRACK] Enqueued {len(energy_list)} mouth animation frames ({len(energy_list)/25.0:.2f}s) [Flushed prior: {flushed_count}]")

    async def recv(self):
        """Called by aiortc for each video frame."""
        now = time.time()
        if self.start_time is None:
            self.start_time = now
            self.next_time = now

        # Frame pacing
        pts = self.frame_index
        self.frame_index += 1

        # 1. Update Natural Eye Blink State Machine
        blink_amount = 0.0
        if self.blink_frame >= 0:
            if self.blink_frame < len(self.blink_profile):
                blink_amount = self.blink_profile[self.blink_frame]
                self.blink_frame += 1
            else:
                self.is_double_blink = False
                self.next_blink_in = random.randint(120, 180)  # Calm 4.8s ~ 7.2s natural interval
        else:
            self.next_blink_in -= 1
            if self.next_blink_in <= 0:
                self.blink_frame = 0
                blink_amount = self.blink_profile[0]
                self.blink_frame += 1

        # 2. Audio energy tracking for speaking state
        if not self.audio_energy_queue.empty():
            self.current_energy = self.audio_energy_queue.get_nowait()
        else:
            self.current_energy = 0.0

        # Smooth attack/decay filter to ensure gentle mouth transitions
        alpha = 0.60 if self.current_energy > self.smooth_energy else 0.30
        self.smooth_energy = self.smooth_energy * (1.0 - alpha) + self.current_energy * alpha

        # 3. Check if idle without any motion (Zero distortion during IDLE)
        if self.smooth_energy < 0.003 and blink_amount == 0.0:
            # 100% pristine untouched original resolution frame (Zero resampling blur, zero warping)
            out_img = self.pristine_rgb
        else:
            # Combined PyTorch CUDA Tensor deformation (Mouth Lip-Sync + Eyelid Blink)
            with torch.no_grad():
                disp_x = torch.zeros_like(self.grid_x)
                disp_y = torch.zeros_like(self.grid_y)

                # A. Natural Eyelid Blink (Anatomical biological eyelid closure)
                if blink_amount > 0.0 and self.eye_disp_y is not None:
                    disp_x = disp_x + self.eye_disp_x * blink_amount
                    disp_y = disp_y + self.eye_disp_y * blink_amount

                # B. Micro Sub-Pixel Precision Lip Sync (if speaking)
                if self.smooth_energy >= 0.003:
                    dist_m = torch.sqrt(
                        ((self.grid_x - self.mouth_cx) / (self.mouth_scale * 1.6)) ** 2 +
                        ((self.grid_y - self.mouth_cy) / (self.mouth_scale * 0.85)) ** 2
                    )
                    # Sharp Gaussian falloff outside the lip fissure
                    mouth_mask = torch.exp(-dist_m * 6.5)

                    # Lower lip naturally drops, upper lip stays virtually stationary
                    y_rel_m = self.grid_y - self.mouth_cy
                    lip_dir = torch.where(y_rel_m > 0, torch.tensor(1.0, device=self.device), torch.tensor(-0.25, device=self.device))

                    # Micro displacement: maximum ~4 to 6 pixels
                    disp_y = disp_y + mouth_mask * lip_dir * (self.smooth_energy * 0.026)

                # Tensor grid sampling on GPU only when speaking or blinking
                deformed_grid = self.base_grid + torch.stack((disp_x, disp_y), dim=-1).unsqueeze(0)
                warped = torch.nn.functional.grid_sample(
                    self.img_tensor,
                    deformed_grid,
                    mode='bilinear',
                    padding_mode='border',
                    align_corners=True
                )

                out_img = (warped.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)

        # Convert to av.VideoFrame
        frame = av.VideoFrame.from_ndarray(out_img, format='rgb24')
        frame.pts = pts
        frame.time_base = self.time_base

        # Monotonic timeline pacing: exactly 40.0ms per frame (25 FPS)
        self.next_time += (1.0 / float(self.fps))
        sleep_dur = self.next_time - time.time()
        if sleep_dur > 0.001:
            await asyncio.sleep(sleep_dur)
        elif sleep_dur < -0.100:
            self.next_time = time.time()

        return frame


class AvatarAudioStreamTrack(AudioStreamTrack):
    """
    aiortc AudioStreamTrack for Real-Time AI Avatar
    - 48,000 Hz, 16-bit PCM Mono
    - Emits silence frames during IDLE (keeps WebRTC connection alive)
    - Emits synchronized speech audio frames during SPEAKING
    """
    kind = "audio"

    def __init__(self, sample_rate=48000, frame_duration_ms=20):
        super().__init__()
        self.sample_rate = sample_rate
        self.frame_samples = int(sample_rate * (frame_duration_ms / 1000.0)) # 960 samples per 20ms
        self.time_base = Fraction(1, sample_rate)

        self.audio_queue = asyncio.Queue()
        self.pts = 0
        self.start_time = None
        self.next_time = None
        self.is_speaking = False

        # Pre-generate 20ms silence frame
        self.silence_chunk = np.zeros(self.frame_samples, dtype=np.int16)

    def queue_audio_pcm(self, pcm_int16_array):
        """Enqueue raw 48kHz int16 PCM audio samples into the stream buffer."""
        # Flush any stale audio from previous speech to guarantee instant start and exact dialogue sync
        flushed_count = 0
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
                flushed_count += 1
            except Exception:
                break

        # Chunk into 960-sample blocks (20ms each)
        num_samples = len(pcm_int16_array)
        total_chunks = 0
        for i in range(0, num_samples, self.frame_samples):
            chunk = pcm_int16_array[i:i + self.frame_samples]
            if len(chunk) < self.frame_samples:
                padded = np.zeros(self.frame_samples, dtype=np.int16)
                padded[:len(chunk)] = chunk
                chunk = padded
            self.audio_queue.put_nowait(chunk)
            total_chunks += 1

        duration_sec = num_samples / float(self.sample_rate)
        print(f"[AUDIO TRACK] Enqueued {total_chunks} audio frames ({duration_sec:.2f}s, {num_samples} samples) [Flushed prior: {flushed_count}]")
        self.is_speaking = True

    async def recv(self):
        """Called by aiortc for each audio packet (every 20ms)."""
        now = time.time()
        if self.start_time is None:
            self.start_time = now
            self.next_time = now

        if not self.audio_queue.empty():
            data = self.audio_queue.get_nowait()
            if self.audio_queue.empty() and self.is_speaking:
                self.is_speaking = False
                print("[AUDIO TRACK] Completed audio queue playback. Returning to silence.")
        else:
            data = self.silence_chunk

        # Pack into av.AudioFrame
        data_reshaped = data.reshape(1, -1)
        frame = av.AudioFrame.from_ndarray(data_reshaped, format='s16', layout='mono')
        frame.sample_rate = self.sample_rate
        frame.pts = self.pts
        frame.time_base = self.time_base

        self.pts += self.frame_samples

        # Monotonic timeline pacing: exactly 20.0ms per audio frame (50 packets/sec)
        self.next_time += (self.frame_samples / float(self.sample_rate))
        sleep_dur = self.next_time - time.time()
        if sleep_dur > 0.001:
            await asyncio.sleep(sleep_dur)
        elif sleep_dur < -0.100:
            self.next_time = time.time()

        return frame
