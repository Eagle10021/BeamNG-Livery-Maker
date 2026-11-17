var messageID = -1;
var isImageDataTransparent = function isImageDataTransparent(imageData) {
  return imageData.data.every(function (x, i) {
    return i % 4 !== 3 || x === 0;
  });
};
function isTransparent(object, worker) {
  // should also move to offscreen
  var canvas = object.toCanvasElement({
    // multiplier: 0.1,
    enableRetinaScaling: false,
    viewportTransform: false,
    withoutTransform: true,
    withoutShadow: true
  });
  var id = ++messageID;
  return new Promise(function (resolve, reject) {
    var _canvas$getContext;
    var imageData = (_canvas$getContext = canvas.getContext('2d')) === null || _canvas$getContext === void 0 ? void 0 : _canvas$getContext.getImageData(0, 0, canvas.width, canvas.height);
    if (!imageData) {
      reject();
    } else if (!worker) {
      resolve(isImageDataTransparent(imageData));
    } else {
      var messageHandler = function messageHandler(e) {
        if (e.data.messageID === id) {
          worker.removeEventListener('message', messageHandler);
          resolve(e.data.isTransparent);
        }
      };
      worker.addEventListener('message', messageHandler);
      worker.postMessage({
        imageData: imageData,
        messageID: id
      }, []);
    }
  });
}
isTransparent.installWorker = function installWorker() {
  addEventListener('message', function (e) {
    var _e$data = e.data,
      imageData = _e$data.imageData,
      messageID = _e$data.messageID;
    postMessage({
      isTransparent: isImageDataTransparent(imageData),
      messageID: messageID
    });
  });
};

export { isTransparent };

