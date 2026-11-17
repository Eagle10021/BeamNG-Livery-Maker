/**
 * A rectangle in canvas pixels (ignoring any transform)
 */

var drawImage = function drawImage(destination, source) {
  var globalCompositeOperation = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'source-over';
  var region = arguments.length > 3 ? arguments[3] : undefined;
  destination.save();
  destination.imageSmoothingEnabled = true;
  destination.imageSmoothingQuality = 'high';
  destination.globalCompositeOperation = globalCompositeOperation;
  destination.resetTransform();
  if (region) {
    var x = region.x,
      y = region.y,
      width = region.width,
      height = region.height;
    // composite only the region, the rest of the destination is left as is
    destination.beginPath();
    destination.rect(x, y, width, height);
    destination.clip();
    destination.drawImage(source.canvas, x, y, width, height, x, y, width, height);
  } else {
    destination.drawImage(source.canvas, 0, 0);
  }
  destination.restore();
};

/**
 *
 * @param destination context to erase
 * @param source context on which the path is drawn upon
 * @param erasingEffect effect to apply to {@link source} after clipping {@link destination}:
 * - drawing all non erasable visuals to achieve a selective erasing effect.
 * - drawing all erasable visuals without their erasers to achieve an undo erasing effect.
 * @param region limits erasing to a rectangle in canvas pixels, the rest of both contexts is left as is
 */
var erase = function erase(destination, source, erasingEffect, region) {
  // clip destination
  drawImage(destination, source, 'destination-out', region);

  // draw erasing effect
  if (erasingEffect) {
    drawImage(source, erasingEffect, 'source-in', region);
  } else {
    source.save();
    source.resetTransform();
    region ? source.clearRect(region.x, region.y, region.width, region.height) : source.clearRect(0, 0, source.canvas.width, source.canvas.height);
    source.restore();
  }
};

export { drawImage, erase };

