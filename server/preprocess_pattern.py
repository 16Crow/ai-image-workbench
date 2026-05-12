import argparse
import os
from typing import Optional, Tuple

import cv2
import numpy as np


def ensure_bgr(image: np.ndarray) -> np.ndarray:
    if image is None:
        raise ValueError("无法读取输入图片")

    if len(image.shape) == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

    if image.shape[2] == 4:
        alpha = image[:, :, 3:4].astype(np.float32) / 255.0
        rgb = image[:, :, :3].astype(np.float32)
        white = np.full_like(rgb, 255.0)
        blended = rgb * alpha + white * (1.0 - alpha)
        return blended.astype(np.uint8)

    return image[:, :, :3]


def normalize_map(channel: np.ndarray) -> np.ndarray:
    channel = channel.astype(np.float32)
    channel -= channel.min()
    peak = channel.max()
    if peak <= 1e-6:
        return np.zeros_like(channel, dtype=np.float32)
    return channel / peak


def score_components(mask: np.ndarray) -> Optional[np.ndarray]:
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if num_labels <= 1:
        return None

    height, width = mask.shape[:2]
    center = np.array([width / 2.0, height / 2.0], dtype=np.float32)
    best_score = -1.0
    best_mask = None

    for label in range(1, num_labels):
        area = float(stats[label, cv2.CC_STAT_AREA])
        if area < mask.size * 0.01:
            continue

        component_center = centroids[label]
        distance = np.linalg.norm(component_center - center) / max(width, height)
        center_score = max(0.0, 1.0 - distance)
        score = area * (0.6 + 0.4 * center_score)

        if score > best_score:
            best_score = score
            best_mask = np.where(labels == label, 255, 0).astype(np.uint8)

    return best_mask


def build_focus_mask(image: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    saturation = normalize_map(hsv[:, :, 1])
    detail = normalize_map(np.abs(cv2.Laplacian(gray, cv2.CV_32F, ksize=3)))
    edges = cv2.Canny(gray, 50, 140).astype(np.float32) / 255.0
    contrast = normalize_map(
        np.abs(gray.astype(np.float32) - cv2.GaussianBlur(gray.astype(np.float32), (0, 0), 9))
    )

    score = 0.38 * saturation + 0.28 * detail + 0.22 * contrast + 0.12 * edges
    threshold = max(0.22, float(np.percentile(score, 68)))
    mask = np.where(score >= threshold, 255, 0).astype(np.uint8)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mask = cv2.dilate(mask, kernel, iterations=1)

    component = score_components(mask)
    if component is not None:
        mask = component

    if cv2.countNonZero(mask) < mask.size * 0.06:
        mask = np.full_like(mask, 255)

    return mask


def rectify_region(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return image

    contour = max(contours, key=cv2.contourArea)
    rect = cv2.minAreaRect(contour)
    (_center_x, _center_y), (width, height), angle = rect

    if min(width, height) < 32:
        return image

    if angle < -45.0:
        angle += 90.0
    elif angle > 45.0:
        angle -= 90.0

    angle = float(np.clip(angle, -20.0, 20.0))

    if abs(angle) < 1.0:
        return image

    height_px, width_px = image.shape[:2]
    center = (width_px / 2.0, height_px / 2.0)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)

    cos = abs(matrix[0, 0])
    sin = abs(matrix[0, 1])
    bound_width = int((height_px * sin) + (width_px * cos))
    bound_height = int((height_px * cos) + (width_px * sin))

    matrix[0, 2] += (bound_width / 2.0) - center[0]
    matrix[1, 2] += (bound_height / 2.0) - center[1]

    rotated_image = cv2.warpAffine(
        image,
        matrix,
        (bound_width, bound_height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REFLECT_101,
    )
    rotated_mask = cv2.warpAffine(
        mask,
        matrix,
        (bound_width, bound_height),
        flags=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )

    points = cv2.findNonZero(rotated_mask)
    if points is None:
        return rotated_image

    x, y, w, h = cv2.boundingRect(points)
    pad = max(6, int(round(min(rotated_image.shape[:2]) * 0.025)))
    x = max(0, x - pad)
    y = max(0, y - pad)
    w = min(rotated_image.shape[1] - x, w + pad * 2)
    h = min(rotated_image.shape[0] - y, h + pad * 2)
    return rotated_image[y : y + h, x : x + w]


def normalize_illumination(image: np.ndarray) -> np.ndarray:
    image_f = image.astype(np.float32)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    sigma = max(15, int(round(min(image.shape[:2]) / 14)))
    if sigma % 2 == 0:
        sigma += 1

    illumination = cv2.GaussianBlur(gray.astype(np.float32), (0, 0), sigma)
    illumination = np.maximum(illumination, 10.0)
    normalized = image_f / illumination[:, :, None] * float(np.mean(illumination))
    normalized = np.clip(normalized, 0, 255).astype(np.uint8)

    lab = cv2.cvtColor(normalized, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    l_channel = clahe.apply(l_channel)
    merged = cv2.merge((l_channel, a_channel, b_channel))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


def build_artifact_mask(image: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    local_contrast = cv2.absdiff(gray, cv2.GaussianBlur(gray, (0, 0), 5))
    value_tophat = cv2.morphologyEx(
        hsv[:, :, 2],
        cv2.MORPH_TOPHAT,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)),
    )

    bright_mask = (
        (hsv[:, :, 2] > 145)
        & (local_contrast > 14)
        & ((hsv[:, :, 1] < 170) | (value_tophat > 28))
    ).astype(np.uint8) * 255

    blackhat = cv2.morphologyEx(
        gray,
        cv2.MORPH_BLACKHAT,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)),
    )
    dark_mask = (
        (blackhat > 36)
        & (hsv[:, :, 1] < 135)
    ).astype(np.uint8) * 255

    artifact_mask = cv2.bitwise_or(bright_mask, dark_mask)
    artifact_mask = cv2.medianBlur(artifact_mask, 5)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(artifact_mask, connectivity=8)
    filtered = np.zeros_like(artifact_mask)
    image_area = artifact_mask.shape[0] * artifact_mask.shape[1]
    height, width = artifact_mask.shape[:2]

    for label in range(1, num_labels):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < 10 or area > image_area * 0.04:
            continue

        x = int(stats[label, cv2.CC_STAT_LEFT])
        y = int(stats[label, cv2.CC_STAT_TOP])
        w = int(stats[label, cv2.CC_STAT_WIDTH])
        h = int(stats[label, cv2.CC_STAT_HEIGHT])
        aspect_ratio = max(w, h) / max(1, min(w, h))
        center_x = (x + w / 2.0) / width
        center_y = (y + h / 2.0) / height
        central_accessory_zone = 0.18 <= center_x <= 0.82 and center_y <= 0.82

        if aspect_ratio > 8.5 and not central_accessory_zone:
            continue

        filtered[labels == label] = 255

    return cv2.dilate(filtered, np.ones((3, 3), np.uint8), iterations=1)


def suppress_small_artifacts(image: np.ndarray) -> np.ndarray:
    filtered = build_artifact_mask(image)
    image_area = filtered.shape[0] * filtered.shape[1]
    if cv2.countNonZero(filtered) < image_area * 0.001:
        return image

    return cv2.inpaint(image, filtered, 5, cv2.INPAINT_TELEA)


def denoise_and_sharpen(image: np.ndarray) -> np.ndarray:
    denoised = cv2.bilateralFilter(image, 7, 35, 35)
    blurred = cv2.GaussianBlur(denoised, (0, 0), 1.2)
    sharpened = cv2.addWeighted(denoised, 1.18, blurred, -0.18, 0)
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def crop_best_pattern_window(image: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape[:2]

    if min(height, width) < 180:
        return image

    saturation = normalize_map(hsv[:, :, 1])
    detail = normalize_map(np.abs(cv2.Laplacian(gray, cv2.CV_32F, ksize=3)))
    edges = cv2.Canny(gray, 60, 140).astype(np.float32) / 255.0
    score = 0.42 * saturation + 0.38 * detail + 0.20 * edges
    score = cv2.GaussianBlur(score, (0, 0), 5)
    artifact_map = build_artifact_mask(image).astype(np.float32) / 255.0
    artifact_map = cv2.GaussianBlur(artifact_map, (0, 0), 3)

    integral = cv2.integral(score)
    artifact_integral = cv2.integral(artifact_map)
    best = None
    candidate_scales = [0.62, 0.72, 0.82]

    for height_scale in candidate_scales:
        for width_scale in candidate_scales:
            window_height = max(64, int(round(height * height_scale)))
            window_width = max(64, int(round(width * width_scale)))
            if window_height >= height or window_width >= width:
                continue

            step_y = max(8, window_height // 10)
            step_x = max(8, window_width // 10)

            for top in range(0, height - window_height + 1, step_y):
                for left in range(0, width - window_width + 1, step_x):
                    bottom = top + window_height
                    right = left + window_width
                    total = (
                        integral[bottom, right]
                        - integral[top, right]
                        - integral[bottom, left]
                        + integral[top, left]
                    )
                    artifact_total = (
                        artifact_integral[bottom, right]
                        - artifact_integral[top, right]
                        - artifact_integral[bottom, left]
                        + artifact_integral[top, left]
                    )
                    mean_score = float(total) / float(window_height * window_width)
                    artifact_score = float(artifact_total) / float(window_height * window_width)
                    center_x = (left + right) / 2.0 / width
                    center_y = (top + bottom) / 2.0 / height
                    center_penalty = abs(center_x - 0.5) * 0.18
                    top_penalty = max(0.0, 0.56 - center_y) * 0.36
                    coverage_bonus = (window_height * window_width) / float(height * width) * 0.08
                    artifact_penalty = artifact_score * 0.45
                    final_score = (
                        mean_score
                        - center_penalty
                        - top_penalty
                        - artifact_penalty
                        + coverage_bonus
                    )

                    if best is None or final_score > best[0]:
                        best = (final_score, left, top, right, bottom)

    if best is None:
        return image

    _, left, top, right, bottom = best
    return image[top:bottom, left:right]


def crop_to_pattern_region(image: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape[:2]

    saturation = normalize_map(hsv[:, :, 1])
    detail = normalize_map(np.abs(cv2.Laplacian(gray, cv2.CV_32F, ksize=3)))
    contrast = normalize_map(
        np.abs(gray.astype(np.float32) - cv2.GaussianBlur(gray.astype(np.float32), (0, 0), 9))
    )
    score = 0.44 * saturation + 0.34 * detail + 0.22 * contrast
    score = cv2.GaussianBlur(score, (0, 0), 7)

    x_coords = np.linspace(-1.0, 1.0, width, dtype=np.float32)
    y_coords = np.linspace(-1.0, 1.0, height, dtype=np.float32)
    grid_x, grid_y = np.meshgrid(x_coords, y_coords)
    center_bias = np.exp(-(grid_x ** 2 * 1.5 + grid_y ** 2 * 1.0))
    score *= center_bias

    threshold = max(0.16, float(np.quantile(score, 0.62)))
    mask = np.where(score >= threshold, 255, 0).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)

    component = score_components(mask)
    if component is not None:
        mask = component

    points = cv2.findNonZero(mask)
    if points is None:
        return image

    x, y, w, h = cv2.boundingRect(points)
    pad = max(8, int(round(min(image.shape[:2]) * 0.04)))
    x = max(0, x - pad)
    y = max(0, y - pad)
    w = min(image.shape[1] - x, w + pad * 2)
    h = min(image.shape[0] - y, h + pad * 2)
    cropped = image[y : y + h, x : x + w]
    return crop_best_pattern_window(cropped)


def preprocess_pattern(image: np.ndarray) -> np.ndarray:
    focus_mask = build_focus_mask(image)
    rectified = rectify_region(image, focus_mask)
    normalized = normalize_illumination(rectified)
    cleaned = suppress_small_artifacts(normalized)
    refined = denoise_and_sharpen(cleaned)
    return crop_to_pattern_region(refined)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Preprocess a cropped fabric image for pattern extraction")
    parser.add_argument("--input", required=True, help="Input image path")
    parser.add_argument("--output", required=True, help="Output image path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    input_path = os.path.abspath(args.input)
    output_path = os.path.abspath(args.output)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    image = ensure_bgr(cv2.imread(input_path, cv2.IMREAD_UNCHANGED))
    processed = preprocess_pattern(image)

    if not cv2.imwrite(output_path, processed):
        raise RuntimeError("写入预处理结果失败")

    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
