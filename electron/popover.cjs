// Pure DIP geometry: works with top/bottom/side taskbars and negative monitor origins.
function popoverBounds(anchor, area, count = 0) {
  const gap = 8, width = Math.max(1, Math.min(400, area.width - gap * 2));
  const height = Math.max(1, Math.min(count === 0 ? 320 : Math.max(244, 126 + Math.ceil(Math.max(0, count) / 2) * 104), 626, area.height - gap * 2));
  const cx = anchor.x + anchor.width / 2, cy = anchor.y + anchor.height / 2;
  let x = cx - width / 2, y;
  if (cy <= area.y) y = area.y + gap;
  else if (cy >= area.y + area.height) y = area.y + area.height - height - gap;
  else if (cx <= area.x || cx >= area.x + area.width) {
    x = cx <= area.x ? area.x + gap : area.x + area.width - width - gap;
    y = cy - height / 2;
  } else y = anchor.y - height - gap >= area.y ? anchor.y - height - gap : anchor.y + anchor.height + gap;
  const clamp = (v, start, length, size) => Math.round(Math.max(start + gap, Math.min(v, start + length - size - gap)));
  return { x: clamp(x, area.x, area.width, width), y: clamp(y, area.y, area.height, height), width, height };
}
module.exports = { popoverBounds };
