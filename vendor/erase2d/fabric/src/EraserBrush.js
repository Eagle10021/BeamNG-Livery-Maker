import { inherits as _inherits, classCallCheck as _classCallCheck, callSuper as _callSuper, defineProperty as _defineProperty, assertThisInitialized as _assertThisInitialized, createClass as _createClass, get as _get, getPrototypeOf as _getPrototypeOf, asyncToGenerator as _asyncToGenerator, regeneratorRuntime as _regeneratorRuntime, toConsumableArray as _toConsumableArray, slicedToArray as _slicedToArray } from '../../helpers/rollupPluginBabelHelpers.js';
import { erase } from '../../core/src/erase.js';
import * as fabric from 'fabric';
import { Group } from 'fabric';
import { ClippingGroup } from './ClippingGroup.js';
import { draw } from './ErasingEffect.js';

function walk(objects, path) {
  return objects.flatMap(function (object) {
    if (!object.erasable || !object.intersectsWithObject(path)) {
      return [];
    } else if (object instanceof Group && object.erasable === 'deep') {
      return walk(object.getObjects(), path);
    } else {
      return [object];
    }
  });
}
var assertClippingGroup = function assertClippingGroup(object) {
  var curr = object.clipPath;
  if (curr instanceof ClippingGroup) {
    return curr;
  }
  var strokeWidth = object.strokeWidth;
  var strokeWidthFactor = new fabric.Point(strokeWidth, strokeWidth);
  var strokeVector = object.strokeUniform ? strokeWidthFactor.divide(object.getObjectScaling()) : strokeWidthFactor;
  var next = new ClippingGroup([], {
    width: object.width + strokeVector.x,
    height: object.height + strokeVector.y
  });
  if (curr) {
    var _curr$translateToOrig = curr.translateToOriginPoint(new fabric.Point(), curr.originX, curr.originY),
      x = _curr$translateToOrig.x,
      y = _curr$translateToOrig.y;
    curr.originX = curr.originY = 'center';
    fabric.util.sendObjectToPlane(curr, undefined, fabric.util.createTranslateMatrix(x, y));
    next.add(curr);
  }
  return object.clipPath = next;
};
function commitErasing(object, sourceInObjectPlane) {
  var clipPath = assertClippingGroup(object);
  clipPath.add(sourceInObjectPlane);
  clipPath.set('dirty', true);
  object.set('dirty', true);
}
function eraseObject(_x, _x2) {
  return _eraseObject.apply(this, arguments);
}
function _eraseObject() {
  _eraseObject = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4(object, source) {
    var clone;
    return _regeneratorRuntime().wrap(function _callee4$(_context4) {
      while (1) switch (_context4.prev = _context4.next) {
        case 0:
          _context4.next = 2;
          return source.clone();
        case 2:
          clone = _context4.sent;
          fabric.util.sendObjectToPlane(clone, undefined, object.calcTransformMatrix());
          commitErasing(object, clone);
          return _context4.abrupt("return", clone);
        case 6:
        case "end":
          return _context4.stop();
      }
    }, _callee4);
  }));
  return _eraseObject.apply(this, arguments);
}
function eraseCanvasDrawable(_x3, _x4, _x5) {
  return _eraseCanvasDrawable.apply(this, arguments);
}
function _eraseCanvasDrawable() {
  _eraseCanvasDrawable = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee5(object, vpt, source) {
    var clone, d;
    return _regeneratorRuntime().wrap(function _callee5$(_context5) {
      while (1) switch (_context5.prev = _context5.next) {
        case 0:
          _context5.next = 2;
          return source.clone();
        case 2:
          clone = _context5.sent;
          d = vpt && object.translateToOriginPoint(new fabric.Point(), object.originX, object.originY);
          fabric.util.sendObjectToPlane(clone, undefined, d ? fabric.util.multiplyTransformMatrixArray([[1, 0, 0, 1, d.x, d.y],
          // apply vpt from center of drawable
          vpt, [1, 0, 0, 1, -d.x, -d.y], object.calcTransformMatrix()]) : object.calcTransformMatrix());
          commitErasing(object, clone);
          return _context5.abrupt("return", clone);
        case 7:
        case "end":
          return _context5.stop();
      }
    }, _callee5);
  }));
  return _eraseCanvasDrawable.apply(this, arguments);
}
var setCanvasDimensions = function setCanvasDimensions(el, ctx, _ref) {
  var width = _ref.width,
    height = _ref.height;
  var retinaScaling = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;
  el.width = width;
  el.height = height;
  if (retinaScaling > 1) {
    el.setAttribute('width', (width * retinaScaling).toString());
    el.setAttribute('height', (height * retinaScaling).toString());
    ctx.scale(retinaScaling, retinaScaling);
  }
};

/**
 * Supports **selective** erasing: only erasable objects are affected by the eraser brush.
 *
 * Supports **{@link inverted}** erasing: the brush can "undo" erasing.
 *
 * Supports **alpha** erasing: setting the alpha channel of the `color` property controls the eraser intensity.
 *
 * In order to support selective erasing, the brush clips the entire canvas and
 * masks all non-erasable objects over the erased path, see {@link draw}.
 *
 * If **{@link inverted}** draws all objects, erasable objects without their eraser, over the erased path.
 * This achieves the desired effect of seeming to erase or undo erasing on erasable objects only.
 *
 * After erasing is done the `end` event {@link ErasingEndEvent} is fired, after which erasing will be committed to the tree.
 * @example
 * canvas = new Canvas();
 * const eraser = new EraserBrush(canvas);
 * canvas.freeDrawingBrush = eraser;
 * canvas.isDrawingMode = true;
 * eraser.on('start', (e) => {
 *    console.log('started erasing');
 *    // prevent erasing
 *    e.preventDefault();
 * });
 * eraser.on('end', (e) => {
 *    const { targets: erasedTargets, path } = e.detail;
 *    e.preventDefault(); // prevent erasing being committed to the tree
 *    eraser.commit({ targets: erasedTargets, path }); // commit manually since default was prevented
 * });
 *
 * In case of performance issues trace {@link drawEffect} calls and consider preventing it from executing
 * @example
 * const eraser = new EraserBrush(canvas);
 * eraser.on('redraw', (e) => {
 *    // prevent effect redraw on pointer down (e.g. useful if canvas didn't change)
 *    e.detail.type === 'start' && e.preventDefault());
 *    // prevent effect redraw after canvas has rendered (effect will become stale)
 *    e.detail.type === 'render' && e.preventDefault());
 * });
 */
var EraserBrush = /*#__PURE__*/function (_fabric$PencilBrush) {
  _inherits(EraserBrush, _fabric$PencilBrush);
  function EraserBrush(canvas) {
    var _this;
    _classCallCheck(this, EraserBrush);
    _this = _callSuper(this, EraserBrush, [canvas]);
    /**
     * When set to `true` the brush will create a visual effect of undoing erasing
     */
    _defineProperty(_assertThisInitialized(_this), "inverted", false);
    _defineProperty(_assertThisInitialized(_this), "active", false);
    /**
     * number of points drawn by the last render, see {@link _getDirtyRegion}
     */
    _defineProperty(_assertThisInitialized(_this), "_renderedPoints", 0);
    var el = document.createElement('canvas');
    var ctx = el.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get context');
    }
    setCanvasDimensions(el, ctx, canvas, _this.canvas.getRetinaScaling());
    _this.effectContext = ctx;
    _this.eventEmitter = new EventTarget();
    return _this;
  }

  /**
   * @returns disposer make sure to call it to avoid memory leaks
   */
  _createClass(EraserBrush, [{
    key: "on",
    value: function on(type, cb, options) {
      var _this2 = this;
      this.eventEmitter.addEventListener(type, cb, options);
      return function () {
        return _this2.eventEmitter.removeEventListener(type, cb, options);
      };
    }
  }, {
    key: "drawEffect",
    value: function drawEffect() {
      draw(this.effectContext, {
        opacity: new fabric.Color(this.color).getAlpha(),
        inverted: this.inverted
      }, {
        canvas: this.canvas
      });
    }

    /**
     * @override
     */
  }, {
    key: "_setBrushStyles",
    value: function _setBrushStyles() {
      var ctx = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.canvas.contextTop;
      _get(_getPrototypeOf(EraserBrush.prototype), "_setBrushStyles", this).call(this, ctx);
      ctx.strokeStyle = 'black';
    }

    /**
     * @override strictly speaking the eraser needs a full render only if it has opacity set.
     * However since {@link PencilBrush} is designed for subclassing that is what we have to work with.
     */
  }, {
    key: "needsFullRender",
    value: function needsFullRender() {
      return true;
    }

    /**
     * @override erase
     *
     * Composites the entire canvas.
     * Pointer moves render through {@link _renderMove} instead.
     */
  }, {
    key: "_render",
    value: function _render() {
      var ctx = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.canvas.getTopContext();
      _get(_getPrototypeOf(EraserBrush.prototype), "_render", this).call(this, ctx);
      erase(this.canvas.getContext(), ctx, this.effectContext);
      this._renderedPoints = this['_points'].length;
    }

    /**
     * The pixel bounds of the part of the path that changed since the last render.
     * The path is smoothed through the midpoints of its points,
     * so adding a point changes the curve from the 2 points before the last rendered one.
     * @returns `undefined` when the entire canvas has to be composited:
     * a straight line moves its end point instead of adding one, and a shadow is drawn outside of the stroke.
     */
  }, {
    key: "_getDirtyRegion",
    value: function _getDirtyRegion() {
      if (this['_hasStraightLine'] || this.shadow) {
        return;
      }
      var points = this['_points'];
      var from = Math.max(0, this._renderedPoints - 3);
      if (from === 0 || points.length - from < 2) {
        return;
      }
      var canvas = this.canvas;
      var el = canvas.getTopContext().canvas;
      var scale = canvas.getRetinaScaling();
      var t = fabric.util.multiplyTransformMatrices([scale, 0, 0, scale, 0, 0], canvas.viewportTransform);
      // how far the stroke extends from its points: square caps reach the corners, miter joins up to the miter limit
      var extent = Math.max(this.strokeLineCap === 'square' ? Math.SQRT2 : 1, this.strokeLineJoin === 'miter' ? this.strokeMiterLimit : 1);
      // in pixels, with a margin for antialiasing
      var pad = this.width / 2 * extent * Math.max(Math.hypot(t[0], t[1]), Math.hypot(t[2], t[3])) + 2;
      var minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (var i = from; i < points.length; i++) {
        var _fabric$util$transfor = fabric.util.transformPoint(points[i], t),
          _x6 = _fabric$util$transfor.x,
          _y = _fabric$util$transfor.y;
        minX = Math.min(minX, _x6);
        minY = Math.min(minY, _y);
        maxX = Math.max(maxX, _x6);
        maxY = Math.max(maxY, _y);
      }
      var x = Math.max(0, Math.floor(minX - pad));
      var y = Math.max(0, Math.floor(minY - pad));
      var width = Math.min(el.width, Math.ceil(maxX + pad)) - x;
      var height = Math.min(el.height, Math.ceil(maxY + pad)) - y;
      if (width <= 0 || height <= 0) {
        return;
      }
      return {
        x: x,
        y: y,
        width: width,
        height: height
      };
    }

    /**
     * Renders only {@link region}: the rest of the top context already holds the effect of the previous render
     * and the rest of the main context is already erased by it.
     */
  }, {
    key: "_renderRegion",
    value: function _renderRegion(region) {
      var ctx = this.canvas.getTopContext();
      ctx.save();
      var transform = ctx.getTransform();
      ctx.resetTransform();
      ctx.beginPath();
      ctx.rect(region.x, region.y, region.width, region.height);
      ctx.clip();
      ctx.clearRect(region.x, region.y, region.width, region.height);
      ctx.setTransform(transform);
      // the full path is stroked but only the region is rasterized
      fabric.PencilBrush.prototype._render.call(this, ctx);
      ctx.restore();
      erase(this.canvas.getContext(), ctx, this.effectContext, region);
      this._renderedPoints = this['_points'].length;
    }

    /**
     * Renders the point added by a pointer move:
     * only the part of the path that changed if possible, see {@link _getDirtyRegion}, the entire canvas otherwise.
     */
  }, {
    key: "_renderMove",
    value: function _renderMove() {
      var region = this._getDirtyRegion();
      if (region) {
        this._renderRegion(region);
        return;
      }
      this.canvas.clearContext(this.canvas.contextTop);
      this._render();
    }

    /**
     * @override {@link drawEffect}
     */
  }, {
    key: "onMouseDown",
    value: function onMouseDown(pointer, context) {
      var _this3 = this;
      if (!this.eventEmitter.dispatchEvent(new CustomEvent('start', {
        detail: context,
        cancelable: true
      }))) {
        return;
      }
      this.active = true;
      this.eventEmitter.dispatchEvent(new CustomEvent('redraw', {
        detail: {
          type: 'start'
        },
        cancelable: true
      })) && this.drawEffect();

      // consider a different approach
      this._disposer = this.canvas.on('after:render', function (_ref2) {
        var ctx = _ref2.ctx;
        if (ctx !== _this3.canvas.getContext()) {
          return;
        }
        _this3.eventEmitter.dispatchEvent(new CustomEvent('redraw', {
          detail: {
            type: 'render'
          },
          cancelable: true
        })) && _this3.drawEffect();
        _this3._render();
      });
      _get(_getPrototypeOf(EraserBrush.prototype), "onMouseDown", this).call(this, pointer, context);
    }

    /**
     * @override run if active.
     * Same as {@link fabric.PencilBrush#onMouseMove} except that it does not clear the entire top context,
     * since {@link _renderMove} may redraw only the part of it that changed.
     */
  }, {
    key: "onMouseMove",
    value: function onMouseMove(pointer, context) {
      if (!this.active || !this.eventEmitter.dispatchEvent(new CustomEvent('move', {
        detail: context,
        cancelable: true
      }))) {
        return;
      }
      var e = context.e;
      if (!this.canvas._isMainEvent(e)) {
        return;
      }
      this.drawStraightLine = !!this.straightLineKey && e[this.straightLineKey];
      if (this.limitedToCanvasSize === true && this._isOutSideCanvas(pointer)) {
        return;
      }
      if (this._addPoint(pointer) && this['_points'].length > 1) {
        this._renderMove();
      }
    }

    /**
     * @override run if active, dispose of {@link drawEffect} listener
     */
  }, {
    key: "onMouseUp",
    value: function onMouseUp(context) {
      var _this$_disposer;
      this.active && _get(_getPrototypeOf(EraserBrush.prototype), "onMouseUp", this).call(this, context);
      this.active = false;
      (_this$_disposer = this._disposer) === null || _this$_disposer === void 0 || _this$_disposer.call(this);
      delete this._disposer;
      return false;
    }

    /**
     * @override {@link fabric.PencilBrush} logic
     */
  }, {
    key: "convertPointsToSVGPath",
    value: function convertPointsToSVGPath(points) {
      return _get(_getPrototypeOf(EraserBrush.prototype), "convertPointsToSVGPath", this).call(this, this.decimate ? this.decimatePoints(points, this.decimate) : points);
    }

    /**
     * @override
     */
  }, {
    key: "createPath",
    value: function createPath(pathData) {
      var path = _get(_getPrototypeOf(EraserBrush.prototype), "createPath", this).call(this, pathData);
      path.set(this.inverted ? {
        globalCompositeOperation: 'source-over',
        stroke: 'white'
      } : {
        globalCompositeOperation: 'destination-out',
        stroke: 'black',
        opacity: new fabric.Color(this.color).getAlpha()
      });
      return path;
    }
  }, {
    key: "commit",
    value: function () {
      var _commit = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(_ref3) {
        var path, targets;
        return _regeneratorRuntime().wrap(function _callee3$(_context3) {
          while (1) switch (_context3.prev = _context3.next) {
            case 0:
              path = _ref3.path, targets = _ref3.targets;
              _context3.t0 = Map;
              _context3.next = 4;
              return Promise.all([].concat(_toConsumableArray(targets.map( /*#__PURE__*/function () {
                var _ref4 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(object) {
                  return _regeneratorRuntime().wrap(function _callee$(_context) {
                    while (1) switch (_context.prev = _context.next) {
                      case 0:
                        _context.t0 = object;
                        _context.next = 3;
                        return eraseObject(object, path);
                      case 3:
                        _context.t1 = _context.sent;
                        return _context.abrupt("return", [_context.t0, _context.t1]);
                      case 5:
                      case "end":
                        return _context.stop();
                    }
                  }, _callee);
                }));
                return function (_x8) {
                  return _ref4.apply(this, arguments);
                };
              }())), _toConsumableArray([[this.canvas.backgroundImage, !this.canvas.backgroundVpt ? this.canvas.viewportTransform : undefined], [this.canvas.overlayImage, !this.canvas.overlayVpt ? this.canvas.viewportTransform : undefined]].filter(function (_ref5) {
                var _ref6 = _slicedToArray(_ref5, 1),
                  object = _ref6[0];
                return !!(object !== null && object !== void 0 && object.erasable);
              }).map( /*#__PURE__*/function () {
                var _ref8 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(_ref7) {
                  var _ref9, object, vptFlag;
                  return _regeneratorRuntime().wrap(function _callee2$(_context2) {
                    while (1) switch (_context2.prev = _context2.next) {
                      case 0:
                        _ref9 = _slicedToArray(_ref7, 2), object = _ref9[0], vptFlag = _ref9[1];
                        _context2.t0 = object;
                        _context2.next = 4;
                        return eraseCanvasDrawable(object, vptFlag, path);
                      case 4:
                        _context2.t1 = _context2.sent;
                        return _context2.abrupt("return", [_context2.t0, _context2.t1]);
                      case 6:
                      case "end":
                        return _context2.stop();
                    }
                  }, _callee2);
                }));
                return function (_x9) {
                  return _ref8.apply(this, arguments);
                };
              }()))));
            case 4:
              _context3.t1 = _context3.sent;
              return _context3.abrupt("return", new _context3.t0(_context3.t1));
            case 6:
            case "end":
              return _context3.stop();
          }
        }, _callee3, this);
      }));
      function commit(_x7) {
        return _commit.apply(this, arguments);
      }
      return commit;
    }()
    /**
     * @override handle events
     */
  }, {
    key: "_finalizeAndAddPath",
    value: function _finalizeAndAddPath() {
      var points = this['_points'];
      if (points.length < 2) {
        this.eventEmitter.dispatchEvent(new CustomEvent('cancel', {
          cancelable: false
        }));
        return;
      }
      var path = this.createPath(this.convertPointsToSVGPath(points));
      var targets = walk(this.canvas.getObjects(), path);
      this.eventEmitter.dispatchEvent(new CustomEvent('end', {
        detail: {
          path: path,
          targets: targets
        },
        cancelable: true
      })) && this.commit({
        path: path,
        targets: targets
      });
      this.canvas.clearContext(this.canvas.contextTop);
      this.canvas.requestRenderAll();
      this._resetShadow();
    }
  }, {
    key: "dispose",
    value: function dispose() {
      var canvas = this.effectContext.canvas;
      // prompt GC
      canvas.width = canvas.height = 0;
      // release ref?
      // delete this.effectContext
    }
  }]);
  return EraserBrush;
}(fabric.PencilBrush);

export { EraserBrush, commitErasing, eraseCanvasDrawable, eraseObject };

