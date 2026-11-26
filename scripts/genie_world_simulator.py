#!/usr/bin/env python3
"""
Genie 4 Live World Simulator
----------------------------
Real-time interactive world simulation with Genie 4 (models/genie-4) over the
Live Interactions API (v1beta) using async WebSockets.

Requirements:
    pip install -U google-genai>=3.5.0

Usage:
    export GEMINI_API_KEY="your-api-key"
    python scripts/genie_world_simulator.py --address "4102 Westheimer Rd, Houston, TX 77027" --output-dir ./tmp/genie-frames
"""

import argparse
import asyncio
import base64
import os
import sys
from pathlib import Path


async def run_genie_world(address: str, output_dir: str | None, duration_seconds: int = 15) -> None:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_GENAI_API_KEY")
    if not api_key:
        print("[Genie 4 Simulator] GEMINI_API_KEY is not set.")
        print("Please export GEMINI_API_KEY='...' before running live interactions.")
        sys.exit(1)

    try:
        from google import genai
    except ImportError:
        print("[Genie 4 Simulator] google-genai is not installed.")
        print("Run: pip install -U 'google-genai>=3.5.0'")
        sys.exit(1)

    out_path = Path(output_dir) if output_dir else None
    if out_path:
        out_path.mkdir(parents=True, exist_ok=True)

    client = genai.Client(api_key=api_key, http_options={"api_version": "v1beta"})

    print(f"[Genie 4 Simulator] Creating live interaction on models/genie-4 for: {address}...")
    interaction = await client.aio.interactions.create(
        model="models/genie-4",
        api_version="v1beta",
        timeout=30.0,
    )
    print(f"[Genie 4 Simulator] Interaction created: {interaction.id}")

    completed = False
    frame_count = 0
    audio_chunk_count = 0

    try:
        async with client.aio.interactions.connect(
            interaction.id,
            api_version="v1beta",
            timeout=30.0,
        ) as conn:
            print("[Genie 4 Simulator] WebSocket connected! Starting consumer task...")

            async def consume_events() -> None:
                nonlocal frame_count, audio_chunk_count
                try:
                    async for event in conn.receive():
                        if event.event_type == "step.delta":
                            delta = event.delta
                            if delta.type == "video" and delta.data:
                                frame_count += 1
                                jpeg_bytes = base64.b64decode(delta.data)
                                if out_path and frame_count % 12 == 0:
                                    frame_file = out_path / f"frame_{frame_count:05d}.jpg"
                                    frame_file.write_bytes(jpeg_bytes)
                                if frame_count % 24 == 0:
                                    print(f"  -> Received {frame_count} video frames (24 fps 16:9)...")
                            elif delta.type == "audio" and delta.data:
                                audio_chunk_count += 1
                                _pcm_stereo = base64.b64decode(delta.data)
                        elif event.event_type == "error":
                            print(f"[Genie 4 Stream Error] {event.error}")
                            break
                        elif event.event_type == "interaction.completed":
                            print("[Genie 4] Interaction marked completed by server.")
                            break
                except asyncio.CancelledError:
                    pass
                except Exception as err:
                    print(f"[Genie 4 Event Loop Error] {err}")

            consumer = asyncio.create_task(consume_events())

            try:
                # 1. Mandatory world_setup
                world_prompt = (
                    f"First-person perspective walking along the concrete sidewalk toward a modern residential Texas home at {address}. "
                    "24 sleek black monocrystalline solar panels mounted across South and West roof planes. "
                    "White Tesla Powerwall 3 battery mounted on the garage exterior. Warm Texas afternoon sunlight, green front lawn. "
                    "Audio: footsteps on concrete, soft warm summer breeze, gentle distant cicadas."
                )
                print(f"[Genie 4] Sending world_setup event...")
                await conn.send({
                    "event_type": "world_setup",
                    "world_prompt": {
                        "text": world_prompt,
                    },
                })

                # 2. Walk forward towards the home
                await asyncio.sleep(3.0)
                print("[Genie 4] Sending user_action: key_down 'key_w' (walk forward)...")
                await conn.send({
                    "event_type": "user_action",
                    "action": "key_down",
                    "input": "key_w",
                })
                await asyncio.sleep(3.0)
                print("[Genie 4] Sending user_action: key_up 'key_w'...")
                await conn.send({
                    "event_type": "user_action",
                    "action": "key_up",
                    "input": "key_w",
                })

                # 3. Look up at the solar array
                await asyncio.sleep(1.0)
                print("[Genie 4] Sending user_action: key_down 'arrow_up' (tilt view toward roof)...")
                await conn.send({
                    "event_type": "user_action",
                    "action": "key_down",
                    "input": "arrow_up",
                })
                await asyncio.sleep(2.0)
                await conn.send({
                    "event_type": "user_action",
                    "action": "key_up",
                    "input": "arrow_up",
                })

                # 4. Mid-stream prompt steering: golden hour lighting
                print("[Genie 4] Steering world: 'Golden hour sunset casts warm amber glow across the solar panels'...")
                await conn.send("Golden hour sunset casts warm amber glow across the solar panels.")
                await asyncio.sleep(4.0)

                # 5. Complete session to immediately stop video token billing
                print("[Genie 4] Calling conn.complete() to end session and halt billing...")
                await conn.complete()
                completed = True
                await consumer
                print(f"[Genie 4] Session finished successfully! Recorded {frame_count} frames, {audio_chunk_count} audio chunks.")
            finally:
                if not consumer.done():
                    consumer.cancel()
                await asyncio.gather(consumer, return_exceptions=True)
    finally:
        if not completed:
            try:
                print("[Genie 4 Teardown] Ensuring session is cancelled...")
                await client.aio.interactions.cancel(
                    interaction.id,
                    api_version="v1beta",
                    timeout=15.0,
                )
            except Exception:
                pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Genie 4 Live World WebSocket Simulator")
    parser.add_argument("--address", default="4102 Westheimer Rd, Houston, TX 77027", help="Property address for world generation")
    parser.add_argument("--output-dir", default=None, help="Directory to save sample JPEG video frames")
    parser.add_argument("--seconds", type=int, default=15, help="Simulation duration in seconds")
    args = parser.parse_args()

    asyncio.run(run_genie_world(args.address, args.output_dir, args.seconds))


if __name__ == "__main__":
    main()
