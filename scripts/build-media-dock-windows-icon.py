import struct
import sys
from pathlib import Path


def png_size(data: bytes) -> tuple[int, int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("ICO sources must be PNG files")
    return struct.unpack(">II", data[16:24])


if len(sys.argv) < 3:
    raise SystemExit("usage: build-media-dock-windows-icon.py OUTPUT.ico INPUT.png...")

output = Path(sys.argv[1])
images = []
for source_path in map(Path, sys.argv[2:]):
    payload = source_path.read_bytes()
    width, height = png_size(payload)
    if width != height or width > 256:
        raise ValueError(f"unsupported ICO source size: {source_path} ({width}x{height})")
    images.append((width, height, payload))

directory_size = 6 + 16 * len(images)
offset = directory_size
entries = []
payloads = []
for width, height, payload in images:
    entries.append(
        struct.pack(
            "<BBBBHHII",
            0 if width == 256 else width,
            0 if height == 256 else height,
            0,
            0,
            1,
            32,
            len(payload),
            offset,
        )
    )
    payloads.append(payload)
    offset += len(payload)

output.write_bytes(struct.pack("<HHH", 0, 1, len(images)) + b"".join(entries + payloads))
