# Colorblind simulation for overlay screenshots (art review, not a test):
#   python3 apps/client/e2e/colorblind.py <in.png> <out.png> [deuteranopia|protanopia|tritanopia]
# Machado, Oliveira and Fernandes (2009) full-severity matrices, applied in linear RGB. The output
# puts the original and the simulation side by side.
import sys

import numpy as np
from PIL import Image

MATRICES = {
    "deuteranopia": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    "protanopia": [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    "tritanopia": [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    kind = sys.argv[3] if len(sys.argv) > 3 else "deuteranopia"
    img = Image.open(src).convert("RGB")
    rgb = np.asarray(img, dtype=np.float64) / 255.0
    lin = to_linear(rgb)
    sim = lin @ np.array(MATRICES[kind]).T
    out = (to_srgb(sim) * 255 + 0.5).astype(np.uint8)
    both = Image.new("RGB", (img.width * 2, img.height))
    both.paste(img, (0, 0))
    both.paste(Image.fromarray(out), (img.width, 0))
    both.save(dst)


if __name__ == "__main__":
    main()
