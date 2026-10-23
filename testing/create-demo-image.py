"""Genera una imagen sintética de paquete para validar carga y marca GPS."""
import struct
import zlib
from pathlib import Path

width, height = 640, 420
scanlines = []
for y in range(height):
    row = bytearray([0])
    for x in range(width):
        if 105 < x < 535 and 125 < y < 355:
            color = (187, 133, 79)
        elif 145 < x < 495 and 165 < y < 325:
            color = (202, 151, 96)
        else:
            color = (225, 232, 241)
        row.extend(color)
    scanlines.append(bytes(row))


def chunk(kind, data):
    return struct.pack("!I", len(data)) + kind + data + struct.pack("!I", zlib.crc32(kind + data) & 0xFFFFFFFF)


image = (
    b"\x89PNG\r\n\x1a\n"
    + chunk(b"IHDR", struct.pack("!2I5B", width, height, 8, 2, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress(b"".join(scanlines)))
    + chunk(b"IEND", b"")
)
Path(__file__).with_name("demo-package.png").write_bytes(image)
