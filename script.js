class LiveryEditor {
    constructor() {
        this.canvas = document.getElementById('livery-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.layers = [];
        this.activeLayerId = null;
        this.clipboard = null; // Layer clipboard
        this.selectedLayers = []; // For multi-select
        this.history = []; // Undo history
        this.historyIndex = -1;
        this.maxHistory = 50;

        // State
        this.currentTool = 'move';
        this.isDragging = false;
        this.isRotating = false;
        this.isResizing = false;
        this.isPanning = false;
        this.isPainting = false;
        this.isDrawingLine = false;
        this.isDrawingPath = false;
        this.pathPoints = [];
        this.activePointIndex = -1;
        this.activeHandle = null; // 'cp1' or 'cp2'
        this.isDraggingPoint = false;
        this.isDraggingHandle = false;
        this.isPullingHandles = false;
        this.lineStart = null;
        this.lastPaintPoint = null;
        this.dragStart = { x: 0, y: 0 };
        this.manifest = null;
        this.brushSize = 10;
        this.brushColor = '#ffffff';
        this.bgColor = '#000000';
        this.brushOpacity = 1.0;
        this.brushHardness = 1.0;

        // Virtual Texture Size (The actual output size)
        this.virtualWidth = 2048;
        this.virtualHeight = 2048;

        // Workspace Viewport
        this.view = {
            x: 0,
            y: 0,
            zoom: 0.2
        };

        this.initEvents();
        this.loadManifest();

        // Initial sizing
        this.updateCanvasDisplaySize();
        setTimeout(() => this.resetView(), 100);
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.id === `tool-${tool}`);
        });

        // Update cursor based on tool
        if (tool === 'brush' || tool === 'eraser') {
            this.canvas.style.cursor = 'crosshair';
        } else if (tool === 'hand') {
            this.canvas.style.cursor = 'grab';
        } else if (tool === 'eyedropper') {
            this.canvas.style.cursor = 'copy';
        } else {
            this.canvas.style.cursor = 'default';
        }

        this.updateControls();
        this.render();
    }

    addShapeLayer(type) {
        const shapeNames = {
            'rect': 'Rectangle',
            'circle': 'Circle',
            'triangle': 'Triangle',
            'star': 'Star',
            'arrow': 'Arrow',
            'diamond': 'Diamond',
            'hexagon': 'Hexagon',
            'octagon': 'Octagon',
            'heart': 'Heart',
            'cross': 'Cross',
            'moon': 'Moon',
            'sun': 'Sun',
            'cloud': 'Cloud',
            'shield': 'Shield',
            'lightning': 'Lightning',
            'gear': 'Gear',
            'flame': 'Flame',
            'check': 'Checkmark',
            'plus': 'Plus',
            'minus': 'Minus',
            'semicircle': 'Semi-Circle',
            'trapezoid': 'Trapezoid',
            'parallelogram': 'Parallelogram'
        };

        const layer = {
            id: Date.now(),
            name: shapeNames[type] || 'Shape',
            type: 'shape',
            shapeType: type,
            color: this.brushColor, // Use universal color
            x: this.virtualWidth / 2, y: this.virtualHeight / 2,
            width: 200, height: 200,
            rotation: 0, opacity: 1, scale: 1, scaleX: 1, scaleY: 1,
            flipX: false, flipY: false,
            hue: 0, saturation: 100, brightness: 100,
            isBase: false, locked: false
        };
        this.layers.push(layer);
        this.saveState();

        this.setTool('move');
        this.setActiveLayer(layer.id);
    }

    createPathLayer(firstPoint) {
        const pt = { x: firstPoint.x, y: firstPoint.y, cp1: { x: firstPoint.x, y: firstPoint.y }, cp2: { x: firstPoint.x, y: firstPoint.y } };
        const layer = {
            id: Date.now(),
            name: 'Vector Path',
            type: 'path',
            points: [pt],
            color: this.brushColor,
            width: 2,
            closed: false,
            x: 0, y: 0,
            scale: 1, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
            isBase: false, locked: false
        };
        this.layers.push(layer);
        this.saveState();
        this.setActiveLayer(layer.id);
        this.render();
    }
    createPaintLayer() {
        // Create a transparent canvas for painting
        const canvas = document.createElement('canvas');
        canvas.width = this.virtualWidth;
        canvas.height = this.virtualHeight;
        const ctx = canvas.getContext('2d');

        // Make it transparent
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Convert to image
        const img = new Image();
        img.src = canvas.toDataURL();
        img.onload = () => {
            const layer = {
                id: Date.now(),
                name: 'Paint Layer',
                type: 'paint',
                img: img,
                canvas: canvas, // Keep reference to canvas for drawing
                ctx: ctx,
                x: this.virtualWidth / 2,
                y: this.virtualHeight / 2,
                width: this.virtualWidth,
                height: this.virtualHeight,
                rotation: 0,
                opacity: 1,
                scale: 1,
                isBase: false,
                locked: true,
                color: null, // No tint by default
                flipX: false,
                flipY: false,
                hue: 0,
                saturation: 100,
                brightness: 100
            };
            // Only add if not already in layers (prevent duplicates)
            if (!this.layers.find(l => l.id === layer.id)) {
                this.layers.push(layer);
            }
            this.setActiveLayer(layer.id);

            // Remove onload handler to prevent it from firing when we update the image
            img.onload = null;
        };
    }

    paintOnLayer(layer, virtualPt, isEraser = false) {
        if (!layer.ctx) return;

        // Transform virtual space coordinates to layer local space
        const local = this.toLocal(virtualPt, layer);
        const paintX = local.x + layer.width / 2;
        const paintY = local.y + layer.height / 2;
        const pt = { x: paintX, y: paintY };

        if (isEraser) {
            layer.ctx.globalCompositeOperation = 'destination-out';
            layer.ctx.strokeStyle = 'rgba(0,0,0,1)';
            layer.ctx.fillStyle = 'rgba(0,0,0,1)';
            layer.ctx.globalAlpha = this.brushOpacity;
        } else {
            layer.ctx.globalCompositeOperation = 'source-over';
            layer.ctx.strokeStyle = this.brushColor;
            layer.ctx.fillStyle = this.brushColor;
            layer.ctx.globalAlpha = this.brushOpacity;
        }

        layer.ctx.lineWidth = this.brushSize; // Use as diameter
        layer.ctx.lineCap = 'round';
        layer.ctx.lineJoin = 'round';

        // Draw smooth line from last point to current point
        if (this.lastPaintPoint) {
            layer.ctx.beginPath();
            layer.ctx.moveTo(this.lastPaintPoint.x, this.lastPaintPoint.y);
            layer.ctx.lineTo(pt.x, pt.y);
            layer.ctx.stroke();
        } else {
            // First point - draw a circle
            layer.ctx.beginPath();
            layer.ctx.arc(pt.x, pt.y, this.brushSize / 2, 0, Math.PI * 2);
            layer.ctx.fill();
        }

        this.lastPaintPoint = pt;

        // Reset
        layer.ctx.globalAlpha = 1;
        layer.ctx.globalCompositeOperation = 'source-over';

        // Just render - don't update image yet (expensive)
        this.render();
    }

    pickColor(virtualPt) {
        // Sample color from all visible layers at this point
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.virtualWidth;
        tempCanvas.height = this.virtualHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw all layers
        this.layers.forEach(layer => this.drawLayer(tempCtx, layer));

        // Get pixel color
        const pixelData = tempCtx.getImageData(Math.floor(virtualPt.x), Math.floor(virtualPt.y), 1, 1).data;
        const r = pixelData[0];
        const g = pixelData[1];
        const b = pixelData[2];

        // Convert to hex
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

        // Update brush color
        this.brushColor = hex;
        document.getElementById('brush-color').value = hex;
        document.getElementById('fg-color-display').style.background = hex;

        // Switch back to brush tool
        this.setTool('brush');
    }

    fillArea(layer, virtualPt) {
        if (!layer.ctx) return;

        const x = Math.floor(virtualPt.x);
        const y = Math.floor(virtualPt.y);

        // Get target color
        const imageData = layer.ctx.getImageData(0, 0, layer.width, layer.height);
        const targetColor = this.getPixelColor(imageData, x, y);
        const fillColor = this.hexToRgb(this.brushColor);

        // Don't fill if same color
        if (this.colorsMatch(targetColor, fillColor)) return;

        // Flood fill algorithm
        this.floodFill(imageData, x, y, targetColor, fillColor);

        layer.ctx.putImageData(imageData, 0, 0);
        layer.img.src = layer.canvas.toDataURL();
        this.render();
    }

    floodFill(imageData, x, y, targetColor, fillColor) {
        const stack = [[x, y]];
        const width = imageData.width;
        const height = imageData.height;
        let iterations = 0;
        const maxIterations = 500000; // Prevent crashes on very large areas

        while (stack.length > 0 && iterations < maxIterations) {
            iterations++;
            const [cx, cy] = stack.pop();

            if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

            const currentColor = this.getPixelColor(imageData, cx, cy);
            if (!this.colorsMatch(currentColor, targetColor)) continue;

            // Set pixel
            this.setPixelColor(imageData, cx, cy, fillColor);

            // Add neighbors
            stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
    }

    getPixelColor(imageData, x, y) {
        const index = (y * imageData.width + x) * 4;
        return {
            r: imageData.data[index],
            g: imageData.data[index + 1],
            b: imageData.data[index + 2],
            a: imageData.data[index + 3]
        };
    }

    setPixelColor(imageData, x, y, color) {
        const index = (y * imageData.width + x) * 4;
        imageData.data[index] = color.r;
        imageData.data[index + 1] = color.g;
        imageData.data[index + 2] = color.b;
        imageData.data[index + 3] = 255;
    }

    colorsMatch(c1, c2) {
        return c1.r === c2.r && c1.g === c2.g && c1.b === c2.b && c1.a === c2.a;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
            a: 255
        } : { r: 255, g: 255, b: 255, a: 255 };
    }

    drawLine(layer, start, end) {
        if (!layer.ctx) return;

        layer.ctx.strokeStyle = this.brushColor;
        layer.ctx.lineWidth = this.brushSize;
        layer.ctx.lineCap = 'round';
        layer.ctx.globalAlpha = this.brushOpacity;

        layer.ctx.beginPath();
        layer.ctx.moveTo(start.x, start.y);
        layer.ctx.lineTo(end.x, end.y);
        layer.ctx.stroke();

        layer.ctx.globalAlpha = 1;
        layer.img.src = layer.canvas.toDataURL();
        this.render();
    }

    addTextLayer(virtualPt) {
        this.pendingTextPos = virtualPt;
        const modal = document.getElementById('text-modal');
        const input = document.getElementById('modal-text-input');
        input.value = 'New Text';
        modal.style.display = 'flex';
        input.focus();
        input.select();
    }

    finalizeAddText(text) {
        const pt = this.pendingTextPos || { x: this.virtualWidth / 2, y: this.virtualHeight / 2 };

        const layer = {
            id: Date.now(),
            name: `Text: ${text}`,
            type: 'text',
            text: text,
            fontFamily: 'Outfit',
            fontSize: Math.max(20, this.brushSize * 5),
            color: this.brushColor,
            curve: 0,
            x: pt.x,
            y: pt.y,
            width: 200, // Initial estimate, will refine in drawLayer if needed
            height: 50,
            rotation: 0,
            opacity: 1,
            scale: 1,
            scaleX: 1,
            scaleY: 1,
            flipX: false,
            flipY: false,
            hue: 0,
            saturation: 100,
            brightness: 100,
            isBase: false,
            locked: false
        };

        this.layers.push(layer);
        this.saveState();
        this.setActiveLayer(layer.id);
        this.setTool('move');
        this.render();
    }

    updateCanvasDisplaySize() {
        const container = document.getElementById('canvas-container');
        const dpr = window.devicePixelRatio || 1;

        // precise width/height from DOM
        const rect = container.getBoundingClientRect();

        // set internal resolution
        this.canvas.width = Math.round(rect.width * dpr);
        this.canvas.height = Math.round(rect.height * dpr);

        // set CSS display size
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        // Ensure crisp rendering
        this.ctx.imageSmoothingEnabled = false;

        // Normalize coordinate system to use CSS pixels
        // this.ctx.scale(dpr, dpr); // We don't scale here because we manage transform in render() 
        // Actually, for crisp rendering, we should handle the scale in the render loop or here.
        // In this app, we do `ctx.setTransform` in render(), so we can't just scale here.
        // We will handle dpr in render().

        this.render();
    }

    resetView() {
        const container = document.getElementById('canvas-container');
        const w = container.clientWidth;
        const h = container.clientHeight;
        const padding = 50;

        const scaleX = (w - padding * 2) / this.virtualWidth;
        const scaleY = (h - padding * 2) / this.virtualHeight;
        const fitScale = Math.min(scaleX, scaleY);
        this.view.zoom = Math.max(0.05, fitScale);

        this.view.x = (w / 2) - (this.virtualWidth / 2 * this.view.zoom);
        this.view.y = (h / 2) - (this.virtualHeight / 2 * this.view.zoom);

        this.updateZoomDisplay();
        this.render();
    }

    updateZoomDisplay() {
        const percentage = Math.round(this.view.zoom * 100);
        const el = document.getElementById('zoom-level');
        if (el) el.innerText = percentage + '%';
        const slider = document.getElementById('canvas-zoom-slider');
        if (slider) slider.value = percentage;
    }

    initEvents() {
        // Navbar
        document.getElementById('vehicle-select').addEventListener('change', async (e) => {
            const vehicle = e.target.value;
            if (vehicle) {
                // Visual feedback
                const skinSel = document.getElementById('skin-select');
                skinSel.innerHTML = '<option>Detecting...</option>';
                skinSel.disabled = true;

                // Auto-detect correct path (Lower vs Upper)
                const bestPath = await this.detectBestSkinPath(vehicle);

                // Populate dropdown with the verified path
                this.populateSkins(vehicle, bestPath);

                // Load it
                this.loadBaseSkin(bestPath);
            }
        });
        document.getElementById('skin-select').addEventListener('change', (e) => {
            // This is now mostly redundant if we auto-load, but good for manual re-selection
            if (e.target.value) this.loadBaseSkin(e.target.value);
        });
        document.getElementById('base-upload').addEventListener('change', (e) => this.handleBaseUpload(e));
        document.getElementById('upload-base-trigger').addEventListener('click', () => document.getElementById('base-upload').click());
        document.getElementById('import-btn').addEventListener('click', () => document.getElementById('file-import').click());
        document.getElementById('file-import').addEventListener('change', (e) => this.addLayerFromUpload(e));
        document.getElementById('export-btn').addEventListener('click', () => this.exportImage());

        // Tools
        document.getElementById('tool-move').addEventListener('click', () => this.setTool('move'));
        document.getElementById('tool-hand').addEventListener('click', () => this.setTool('hand'));
        document.getElementById('tool-brush').addEventListener('click', () => this.setTool('brush'));
        document.getElementById('tool-eraser').addEventListener('click', () => this.setTool('eraser'));

        // Shapes Flyout Logic
        const shapesBtn = document.getElementById('tool-shapes');
        const flyout = document.getElementById('shapes-flyout');
        shapesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            flyout.classList.toggle('show');
        });

        document.querySelectorAll('.flyout-item').forEach(item => {
            item.addEventListener('click', () => {
                const shape = item.dataset.shape;
                this.addShapeLayer(shape);
                flyout.classList.remove('show');
            });
        });

        // Close flyout when clicking outside
        window.addEventListener('click', () => {
            flyout.classList.remove('show');
        });

        document.getElementById('tool-fill').addEventListener('click', () => this.setTool('fill'));
        document.getElementById('tool-eyedropper').addEventListener('click', () => this.setTool('eyedropper'));
        document.getElementById('tool-text').addEventListener('click', () => this.setTool('text'));
        document.getElementById('tool-pen').addEventListener('click', () => this.setTool('pen'));
        document.getElementById('tool-line').addEventListener('click', () => this.setTool('line'));

        // New Paint Layer
        document.getElementById('new-paint-layer-btn').addEventListener('click', () => this.createPaintLayer());

        // Toggle Lock Button
        document.getElementById('toggle-lock-btn').addEventListener('click', () => this.toggleLockActiveLayer());

        // Brush Controls
        document.getElementById('brush-color').addEventListener('input', (e) => {
            this.brushColor = e.target.value;
            document.getElementById('fg-color-display').style.background = e.target.value;

            // Sync with active layer if selected
            if (this.activeLayerId) {
                const layer = this.layers.find(l => l.id === this.activeLayerId);
                const colorableTypes = ['shape', 'path', 'text', 'paint', 'raster'];
                if (layer && colorableTypes.includes(layer.type)) {
                    layer.color = this.brushColor;
                    this.render();
                }
            }
        });

        document.getElementById('brush-size').addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            document.getElementById('brush-size-val').innerText = e.target.value;
        });

        document.getElementById('brush-opacity').addEventListener('input', (e) => {
            this.brushOpacity = parseInt(e.target.value) / 100;
            document.getElementById('brush-opacity-val').innerText = e.target.value;
        });

        document.getElementById('brush-hardness').addEventListener('input', (e) => {
            this.brushHardness = parseInt(e.target.value) / 100;
            document.getElementById('brush-hardness-val').innerText = e.target.value;
        });

        // Color Swatches
        document.getElementById('fg-color-display').addEventListener('click', () => {
            document.getElementById('brush-color').click();
        });

        document.getElementById('bg-color-display').addEventListener('click', () => {
            // Swap foreground and background colors
            const temp = this.brushColor;
            this.brushColor = this.bgColor;
            this.bgColor = temp;

            // Update UI
            document.getElementById('brush-color').value = this.brushColor;
            document.getElementById('fg-color-display').style.background = this.brushColor;
            document.getElementById('bg-color-display').style.background = this.bgColor;
        });

        // Properties
        const updateProp = (id, prop, transform) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', (e) => {
                this.updateActiveLayer(prop, transform ? transform(e.target.value) : e.target.value);
            });
        };

        updateProp('prop-opacity', 'opacity', v => v / 100);
        updateProp('prop-rotation', 'html-rotation');
        updateProp('prop-scale', 'scale', parseFloat);
        updateProp('prop-hue', 'hue', parseInt);
        updateProp('prop-saturation', 'saturation', parseInt);
        updateProp('prop-brightness', 'brightness', parseInt);
        updateProp('prop-color', 'color');
        updateProp('prop-path-width', 'width', parseInt);
        document.getElementById('prop-path-closed').addEventListener('change', (e) => {
            this.updateActiveLayer('closed', e.target.checked);
        });

        // Text Settings
        document.getElementById('prop-text-content').addEventListener('input', (e) => {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer && layer.type === 'text') {
                layer.text = e.target.value;
                layer.name = `Text: ${e.target.value}`;
                this.updateLayerList();
                this.render();
            }
        });
        document.getElementById('prop-text-font').addEventListener('change', (e) => {
            this.updateActiveLayer('fontFamily', e.target.value);
        });
        document.getElementById('prop-text-size').addEventListener('input', (e) => {
            this.updateActiveLayer('fontSize', parseInt(e.target.value));
        });
        document.getElementById('prop-text-curve').addEventListener('input', (e) => {
            document.getElementById('prop-text-curve-num').value = e.target.value;
            this.updateActiveLayer('curve', parseInt(e.target.value));
        });
        document.getElementById('prop-text-curve-num').addEventListener('input', (e) => {
            document.getElementById('prop-text-curve').value = e.target.value;
            this.updateActiveLayer('curve', parseInt(e.target.value));
        });

        // Text Modal Buttons
        document.getElementById('modal-text-confirm').addEventListener('click', () => {
            const val = document.getElementById('modal-text-input').value;
            if (val) {
                this.finalizeAddText(val);
            }
            document.getElementById('text-modal').style.display = 'none';
        });
        document.getElementById('modal-text-cancel').addEventListener('click', () => {
            document.getElementById('text-modal').style.display = 'none';
        });

        document.getElementById('btn-flip-h').addEventListener('click', () => this.flipActiveLayer('h'));
        document.getElementById('btn-flip-v').addEventListener('click', () => this.flipActiveLayer('v'));

        document.getElementById('btn-mirror-h').addEventListener('click', () => this.createMirrorLayer('h'));
        document.getElementById('btn-mirror-v').addEventListener('click', () => this.createMirrorLayer('v'));

        document.getElementById('prop-rotation-slider').addEventListener('input', (e) => {
            document.getElementById('prop-rotation').value = e.target.value;
            this.updateActiveLayer('html-rotation', e.target.value);
        });

        document.getElementById('delete-layer-btn').addEventListener('click', () => this.deleteActiveLayer());
        document.getElementById('rasterize-layer-btn').addEventListener('click', () => this.rasterizeActiveLayer());

        // Keyboard & Context Handlers
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        // Context Menu
        this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        document.addEventListener('click', () => this.hideContextMenu());

        // Context Menu Actions
        document.getElementById('ctx-delete').addEventListener('click', () => this.deleteActiveLayer());
        document.getElementById('ctx-duplicate').addEventListener('click', () => this.duplicateActiveLayer());
        document.getElementById('ctx-bring-front').addEventListener('click', () => this.reorderActiveLayer('front'));
        document.getElementById('ctx-send-back').addEventListener('click', () => this.reorderActiveLayer('back'));
        document.getElementById('ctx-flip-h').addEventListener('click', () => this.flipActiveLayer('h'));
        document.getElementById('ctx-flip-v').addEventListener('click', () => this.flipActiveLayer('v'));
        document.getElementById('ctx-lock').addEventListener('click', () => this.toggleLockActiveLayer());

        const resetBtn = document.getElementById('reset-view-btn');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetView());

        new ResizeObserver(() => this.updateCanvasDisplaySize()).observe(document.querySelector('.workspace'));

        // Drag & Drop
        const workspace = document.querySelector('.workspace');
        workspace.addEventListener('dragover', (e) => { e.preventDefault(); });
        workspace.addEventListener('drop', (e) => this.handleDrop(e));

        // Global Paste (for external images)
        window.addEventListener('paste', (e) => this.handlePaste(e));

        // Help Button
        const helpBtn = document.getElementById('help-btn');
        if (helpBtn) helpBtn.addEventListener('click', () => {
            document.getElementById('help-modal').style.display = 'flex';
        });

        // Zoom Slider
        const zoomSlider = document.getElementById('canvas-zoom-slider');
        if (zoomSlider) {
            zoomSlider.addEventListener('input', (e) => {
                const percentage = parseInt(e.target.value);
                const newZoom = percentage / 100;

                // Calculate center point in virtual space
                const container = document.getElementById('canvas-container');
                const centerX = container.clientWidth / 2;
                const centerY = container.clientHeight / 2;

                const virtCenter = this.screenToVirtual(centerX, centerY);

                this.view.zoom = newZoom;

                // Recenter
                this.view.x = centerX - virtCenter.x * newZoom;
                this.view.y = centerY - virtCenter.y * newZoom;

                this.updateZoomDisplay();
                this.render();
            });
        }

        document.getElementById('undo-btn').addEventListener('click', () => this.undo());
        document.getElementById('redo-btn').addEventListener('click', () => this.redo());
    }

    handleKeyDown(e) {
        if (e.target.tagName === 'INPUT') return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.activeLayerId) this.deleteActiveLayer();
        }

        if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            this.duplicateActiveLayer();
        }

        if (e.key === 'Enter') {
            if (this.currentTool === 'pen') this.setTool('move');
        }

        if (e.key === 'Escape') {
            if (this.currentTool === 'pen') {
                this.setActiveLayer(null);
                this.setTool('move');
            }
        }

        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            document.getElementById('undo-btn').click();
        }

        if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            document.getElementById('redo-btn').click();
        }

        if (e.ctrlKey && e.key === 'c') {
            e.preventDefault();
            this.copyActiveLayer();
        }

        if (e.ctrlKey && e.key === 'v') {
            e.preventDefault();
            this.pasteLayer();
        }


    }

    handleWheel(e) {
        e.preventDefault();
        const zoomSpeed = 0.001 * (this.view.zoom);
        const zoomDelta = -e.deltaY * zoomSpeed;
        const oldZoom = this.view.zoom;
        let newZoom = Math.min(Math.max(oldZoom + zoomDelta, 0.05), 50.0);

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const virtX = (mouseX - this.view.x) / oldZoom;
        const virtY = (mouseY - this.view.y) / oldZoom;

        this.view.x = mouseX - virtX * newZoom;
        this.view.y = mouseY - virtY * newZoom;
        this.view.zoom = newZoom;

        this.updateZoomDisplay();
        this.render();
    }

    screenToVirtual(screenX, screenY) {
        return {
            x: (screenX - this.view.x) / this.view.zoom,
            y: (screenY - this.view.y) / this.view.zoom
        };
    }

    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        return this.screenToVirtual(e.clientX - rect.left, e.clientY - rect.top);
    }

    // --- Context Menu ---
    handleContextMenu(e) {
        e.preventDefault();
        // Try to select layer under mouse first if not already selected
        const virtualPt = this.getCanvasCoordinates(e);
        let hitLayer = this.hitTest(virtualPt);

        if (hitLayer) {
            this.setActiveLayer(hitLayer.id);
        } else {
            // Clicked empty space
            // this.activeLayerId = null; // Maybe keep selection?
        }

        // Show menu
        const menu = document.getElementById('context-menu');
        menu.style.display = 'flex';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';

        // Update Lock Text
        const lockText = (this.activeLayerId && this.layers.find(l => l.id === this.activeLayerId)?.locked) ? 'Unlock' : 'Lock';
        document.getElementById('ctx-lock').innerText = lockText;
    }

    hideContextMenu() {
        document.getElementById('context-menu').style.display = 'none';
    }

    // --- Interaction ---
    hitTest(virtualPt) {
        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            if (layer.hidden || layer.isBase || (layer.locked && this.currentTool !== 'hand')) continue;

            const local = this.toLocal(virtualPt, layer);
            const w = layer.width * (layer.scaleX || layer.scale || 1);
            const h = layer.height * (layer.scaleY || layer.scale || 1);

            // Adjust local point to be relative to center considering scale, but hit testing usually happens in local unscaled space? 
            // Actually, if we use local coords, we should check against unscaled width/height?
            // toLocal removes rotation and translation. It does NOT remove scale.
            // So if toLocal does not remove scale, we need to compare against Scaled Width/Height.
            // Correct.

            if (Math.abs(local.x) <= w / 2 && Math.abs(local.y) <= h / 2) {
                // If it's a paint or image layer, check for transparency at that pixel
                if (layer.type === 'paint' || layer.type === 'image') {
                    if (this.isPixelTransparent(layer, local.x / layer.scale, local.y / layer.scale)) {
                        continue;
                    }
                }
                return layer;
            }
        }
        return null;
    }

    isPixelTransparent(layer, imX, imY) {
        // Correct for non-uniform scale
        const sx = layer.scaleX || layer.scale || 1;
        const sy = layer.scaleY || layer.scale || 1;
        const x = Math.floor(imX / sx + layer.width / 2);
        const y = Math.floor(imY / sy + layer.height / 2);

        if (x < 0 || x >= layer.width || y < 0 || y >= layer.height) return true;

        if (layer.type === 'paint' && layer.ctx) {
            const data = layer.ctx.getImageData(x, y, 1, 1).data;
            return data[3] < 10; // Threshold for transparency
        }

        if (layer.type === 'image' && layer.img) {
            if (!this.hitCanvas) {
                this.hitCanvas = document.createElement('canvas');
                this.hitCanvas.width = 1;
                this.hitCanvas.height = 1;
                this.hitCtx = this.hitCanvas.getContext('2d');
            }
            this.hitCtx.clearRect(0, 0, 1, 1);
            try {
                this.hitCtx.drawImage(layer.img, x, y, 1, 1, 0, 0, 1, 1);
                return this.hitCtx.getImageData(0, 0, 1, 1).data[3] < 10;
            } catch (e) {
                return false; // CORS or other issues, assume hit
            }
        }
        return false;
    }

    handleMouseDown(e) {
        if (e.button === 1 || this.currentTool === 'hand') {
            e.preventDefault();
            this.isPanning = true;
            this.canvas.style.cursor = 'grabbing';
            this.panStart = { x: e.clientX, y: e.clientY };
            this.panStartView = { x: this.view.x, y: this.view.y };
            return;
        }

        const virtualPt = this.getCanvasCoordinates(e);

        // Pen Tool - Professional vector editing
        if (this.currentTool === 'pen') {
            const pt = { x: virtualPt.x, y: virtualPt.y };
            const activeLayer = this.layers.find(l => l.id === this.activeLayerId);

            if (activeLayer && activeLayer.type === 'path' && !activeLayer.locked) {
                const threshold = 12 / this.view.zoom;

                // 1. Check for Close Path (Prioritize over handles for the start point)
                if (activeLayer.points.length > 2 && !activeLayer.closed) {
                    const p0 = activeLayer.points[0];
                    if (Math.hypot(p0.x - pt.x, p0.y - pt.y) < threshold) {
                        activeLayer.closed = true;
                        this.saveState();
                        this.render();
                        return;
                    }
                }

                // 2. Check for handle hits
                for (let i = 0; i < activeLayer.points.length; i++) {
                    const p = activeLayer.points[i];
                    if (p.cp1 && Math.hypot(p.cp1.x - pt.x, p.cp1.y - pt.y) < threshold) {
                        this.activePointIndex = i;
                        this.activeHandle = 'cp1';
                        this.isDraggingHandle = true;
                        this.render();
                        return;
                    }
                    if (p.cp2 && Math.hypot(p.cp2.x - pt.x, p.cp2.y - pt.y) < threshold) {
                        this.activePointIndex = i;
                        this.activeHandle = 'cp2';
                        this.isDraggingHandle = true;
                        this.render();
                        return;
                    }
                }

                // 2. Check for point hit (Select, Drag, Delete, Close)
                let foundIndex = -1;
                for (let i = 0; i < activeLayer.points.length; i++) {
                    const p = activeLayer.points[i];
                    if (Math.hypot(p.x - pt.x, p.y - pt.y) < threshold) {
                        foundIndex = i;
                        break;
                    }
                }

                if (foundIndex !== -1) {
                    if (e.altKey) {
                        // Alt + Click = Delete point
                        activeLayer.points.splice(foundIndex, 1);
                        if (activeLayer.points.length === 0) {
                            this.deleteActiveLayer();
                        } else {
                            this.saveState();
                            this.render();
                        }
                        return;
                    }

                    if (foundIndex === 0 && activeLayer.points.length > 2 && !activeLayer.closed) {
                        // Already handled at the top, but keeping for logic consistency if reached
                        activeLayer.closed = true;
                        this.saveState();
                        this.render();
                        return;
                    }

                    // Start dragging existing point
                    this.activePointIndex = foundIndex;
                    this.isDraggingPoint = true;
                    this.render();
                    return;
                }

                // 3. Check for segment hit (Insert point)
                for (let i = 0; i < activeLayer.points.length - 1; i++) {
                    const d = this.getDistToSegment(pt, activeLayer.points[i], activeLayer.points[i + 1]);
                    if (d < threshold) {
                        const newPt = { x: pt.x, y: pt.y, cp1: { x: pt.x, y: pt.y }, cp2: { x: pt.x, y: pt.y } };
                        activeLayer.points.splice(i + 1, 0, newPt);
                        this.activePointIndex = i + 1;
                        this.isPullingHandles = true;
                        this.saveState();
                        this.render();
                        return;
                    }
                }

                // 4. If path is closed, don't auto-add points unless on segment
                if (activeLayer.closed) return;

                // 5. No hit? Add new point at the end
                const newPt = { x: pt.x, y: pt.y, cp1: { x: pt.x, y: pt.y }, cp2: { x: pt.x, y: pt.y } };
                activeLayer.points.push(newPt);
                this.activePointIndex = activeLayer.points.length - 1;
                this.isPullingHandles = true;
                this.saveState();
                this.render();
            } else {
                this.createPathLayer(pt);
                this.isPullingHandles = true;
                this.activePointIndex = 0;
            }
            return;
        }

        // Brush or Eraser Tool - Paint on active paint layer
        if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer && layer.type === 'paint' && !layer.isBase) {
                this.isPainting = true;
                this.paintOnLayer(layer, virtualPt, this.currentTool === 'eraser');
            }
            return;
        }

        // Eyedropper Tool - Pick color from canvas
        if (this.currentTool === 'eyedropper') {
            this.pickColor(virtualPt);
            return;
        }

        // Fill Tool - Fill area with color
        if (this.currentTool === 'fill') {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer && layer.type === 'paint' && !layer.isBase) {
                this.fillArea(layer, virtualPt);
            }
            return;
        }

        // Line Tool - Start drawing line
        if (this.currentTool === 'line') {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer && layer.type === 'paint' && !layer.locked) {
                this.isDrawingLine = true;
                this.lineStart = virtualPt;
            }
            return;
        }

        // Text Tool - Add text layer
        if (this.currentTool === 'text') {
            this.addTextLayer(virtualPt);
            return;
        }

        if (this.currentTool !== 'move') {
            return;
        }

        // Gizmo check
        if (this.activeLayerId) {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer && !layer.isBase && !layer.locked) {
                const local = this.toLocal(virtualPt, layer);
                if (this.checkGizmoHit(local, layer)) return;
            }
        }

        // Hit Detect
        let hitLayer = this.hitTest(virtualPt);

        if (hitLayer) {
            this.setActiveLayer(hitLayer.id);
            this.isDragging = true;
            this.dragStart = virtualPt;
        } else {
            // Clicked Empty -> Pan
            this.isPanning = true;
            this.canvas.style.cursor = 'grabbing';
            this.panStart = { x: e.clientX, y: e.clientY };
            this.panStartView = { x: this.view.x, y: this.view.y };
        }
    }

    checkGizmoHit(local, layer) {
        const sx = layer.scaleX || layer.scale || 1;
        const sy = layer.scaleY || layer.scale || 1;
        const w = layer.width * sx;
        const h = layer.height * sy;
        const hw = w / 2, hh = h / 2;
        const handleSize = 20 / this.view.zoom;

        if (Math.abs(local.x) < handleSize && Math.abs(local.y + (hh + 25 / this.view.zoom)) < handleSize) {
            this.isRotating = true; return true;
        }

        const check = (x, y, anchor) => {
            if (Math.abs(local.x - x) < handleSize && Math.abs(local.y - y) < handleSize) {
                this.isResizing = true; this.resizeAnchor = anchor; return true;
            }
            return false;
        };

        if (check(hw, hh, 'BR')) return true;
        if (check(-hw, hh, 'BL')) return true;
        if (check(hw, -hh, 'TR')) return true;
        if (check(-hw, -hh, 'TL')) return true;

        return false;
    }

    getDistToSegment(p, a, b) {
        const x = p.x, y = p.y, x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y;
        const dx = x2 - x1, dy = y2 - y1;
        if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
        const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
        if (t < 0) return Math.hypot(x - x1, y - y1);
        if (t > 1) return Math.hypot(x - x2, y - y2);
        return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
    }

    toLocal(point, layer) {
        const dx = point.x - layer.x;
        const dy = point.y - layer.y;
        const cos = Math.cos(-layer.rotation);
        const sin = Math.sin(-layer.rotation);
        return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    }

    handleMouseMove(e) {
        if (this.isPullingHandles && this.activeLayerId) {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer && layer.type === 'path' && this.activePointIndex !== -1) {
                const pt = this.getCanvasCoordinates(e);
                const p = layer.points[this.activePointIndex];

                // cp2 follows mouse, cp1 is reflection
                p.cp2 = { x: pt.x, y: pt.y };
                p.cp1 = { x: 2 * p.x - pt.x, y: 2 * p.y - pt.y };

                this.render();
            }
            return;
        }

        if (this.isDraggingHandle && this.activeLayerId) {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer && layer.type === 'path' && this.activePointIndex !== -1) {
                const pt = this.getCanvasCoordinates(e);
                const p = layer.points[this.activePointIndex];

                const oldHandlePos = { x: p[this.activeHandle].x, y: p[this.activeHandle].y };
                p[this.activeHandle] = { x: pt.x, y: pt.y };

                // If NOT holding Alt/Option, move opposite handle symmetrically (radius and angle)
                if (!e.altKey) {
                    const otherHandle = this.activeHandle === 'cp1' ? 'cp2' : 'cp1';
                    if (p[otherHandle]) {
                        const dx = pt.x - p.x;
                        const dy = pt.y - p.y;
                        p[otherHandle] = { x: p.x - dx, y: p.y - dy };
                    }
                }

                this.render();
            }
            return;
        }

        if (this.isDraggingPoint && this.activeLayerId) {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer && layer.type === 'path' && this.activePointIndex !== -1) {
                const pt = this.getCanvasCoordinates(e);
                const p = layer.points[this.activePointIndex];
                const dx = pt.x - p.x;
                const dy = pt.y - p.y;

                // Move point and its handles together
                p.x = pt.x;
                p.y = pt.y;
                if (p.cp1) { p.cp1.x += dx; p.cp1.y += dy; }
                if (p.cp2) { p.cp2.x += dx; p.cp2.y += dy; }

                this.render();
            }
            return;
        }

        if (this.isPanning) {
            const dx = e.clientX - this.panStart.x;
            const dy = e.clientY - this.panStart.y;
            this.view.x = this.panStartView.x + dx;
            this.view.y = this.panStartView.y + dy;
            this.render();
            return;
        }

        // Continue painting if mouse is down
        if (this.isPainting && this.activeLayerId) {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer && layer.type === 'paint' && !layer.isBase) {
                const virtualPt = this.getCanvasCoordinates(e);
                this.paintOnLayer(layer, virtualPt, this.currentTool === 'eraser');
            }
            return;
        }

        const virtualPt = this.getCanvasCoordinates(e);

        if (this.isRotating && this.activeLayerId) {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer) {
                const angle = Math.atan2(virtualPt.y - layer.y, virtualPt.x - layer.x);
                layer.rotation = angle + Math.PI / 2; // Offset for top-handle position

                // Sync mirror rotation
                if (layer.mirrorLayerId) {
                    const mirror = this.layers.find(l => l.id === layer.mirrorLayerId);
                    if (mirror) {
                        mirror.rotation = -layer.rotation;
                    }
                }

                this.updateControls();
                this.render();
            }
            return;
        }

        if (this.isResizing && this.activeLayerId) {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer) {
                // Calculate new dimensions based on mouse position
                const local = this.toLocal(virtualPt, layer);

                // Determine new scale X and Y based on distance from center
                // This assumes dragging from corners (which gizmos are)
                // New Half Width = abs(local.x)
                // New Scale X = New Half Width / Original Half Width

                let newScaleX = Math.abs(local.x) / (layer.width / 2);
                let newScaleY = Math.abs(local.y) / (layer.height / 2);

                newScaleX = Math.max(0.01, newScaleX);
                newScaleY = Math.max(0.01, newScaleY);

                if (e.shiftKey) {
                    // Uniform scaling (maintain aspect ratio)
                    // Use the larger scale factor to grow, or follow logic
                    const maxScale = Math.max(newScaleX, newScaleY);
                    layer.scaleX = maxScale;
                    layer.scaleY = maxScale;
                    layer.scale = maxScale;
                } else {
                    // Free scaling
                    layer.scaleX = newScaleX;
                    layer.scaleY = newScaleY;
                    layer.scale = (newScaleX + newScaleY) / 2; // Average for UI
                }

                // Sync mirror scale
                if (layer.mirrorLayerId) {
                    const mirror = this.layers.find(l => l.id === layer.mirrorLayerId);
                    if (mirror) {
                        mirror.scale = layer.scale;
                        mirror.scaleX = layer.scaleX;
                        mirror.scaleY = layer.scaleY;
                    }
                }

                this.updateControls();
                this.render();
            }
            return;
        }

        if (this.isDragging && this.activeLayerId) {
            const dx = virtualPt.x - this.dragStart.x;
            const dy = virtualPt.y - this.dragStart.y;
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer) {
                layer.x += dx;
                layer.y += dy;

                // Sync mirror
                if (layer.mirrorLayerId) {
                    const mirror = this.layers.find(l => l.id === layer.mirrorLayerId);
                    if (mirror) {
                        if (mirror.mirrorAxis === 'h') {
                            mirror.x = this.virtualWidth - layer.x;
                            mirror.y = layer.y;
                        } else {
                            mirror.x = layer.x;
                            mirror.y = this.virtualHeight - layer.y;
                        }
                    }
                }

                this.render();
            }
            this.dragStart = virtualPt;
        }
    }

    handleMouseUp(e) {
        // Complete line drawing
        if (this.isDrawingLine && this.lineStart) {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer && layer.type === 'paint' && !layer.locked) {
                const virtualPt = this.getCanvasCoordinates(e);
                this.drawLine(layer, this.lineStart, virtualPt);
            }
        }

        // Finalize paint stroke - update image from canvas
        if (this.isPainting && this.activeLayerId) {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer && layer.type === 'paint' && layer.canvas) {
                layer.img.src = layer.canvas.toDataURL();
            }
        }

        if (this.isDraggingPoint || this.isDraggingHandle || this.isPullingHandles) {
            this.saveState();
        }

        this.isDragging = false;
        this.isRotating = false;
        this.isResizing = false;
        this.isPanning = false;
        this.isPainting = false;
        this.isDraggingPoint = false;
        this.isDraggingHandle = false;
        this.isPullingHandles = false;
        this.isDrawingLine = false;
        this.lineStart = null;
        this.lastPaintPoint = null;
        if (this.currentTool === 'hand') this.canvas.style.cursor = 'grab';
        else if (this.currentTool === 'move') this.canvas.style.cursor = 'default';
        else this.canvas.style.cursor = 'crosshair';
        this.render();
    }

    // --- Rendering ---
    render() {
        // Reset transform to identity (but scaled by DPR) for clearing
        const dpr = window.devicePixelRatio || 1;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        // Apply DPR scaling usually via setTransform
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.imageSmoothingEnabled = false; // Always crisp

        // Then apply view transform
        this.ctx.translate(this.view.x, this.view.y);
        this.ctx.scale(this.view.zoom, this.view.zoom);

        // Background
        this.ctx.fillStyle = '#1c1c1c';
        this.ctx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 10 / this.view.zoom;
        this.ctx.strokeRect(0, 0, this.virtualWidth, this.virtualHeight);

        // Layers
        this.layers.forEach(layer => {
            if (!layer.hidden) this.drawLayer(this.ctx, layer);
        });

        // Gizmos
        if (this.activeLayerId && this.currentTool === 'move') {
            const layer = this.layers.find(l => l.id === this.activeLayerId);
            if (layer && !layer.isBase && !layer.locked && !layer.hidden) {
                this.drawGizmos(this.ctx, layer);
            }
        }
        this.ctx.restore();
    }

    drawLayer(ctx, layer, skipUI = false) {
        ctx.save();
        ctx.translate(layer.x, layer.y);
        ctx.rotate(layer.rotation);

        const sx = (layer.flipX ? -1 : 1) * (layer.scaleX || layer.scale || 1);
        const sy = (layer.flipY ? -1 : 1) * (layer.scaleY || layer.scale || 1);
        ctx.scale(sx, sy);

        const hue = layer.hue || 0;
        const sat = layer.saturation !== undefined ? layer.saturation : 100;
        const bright = layer.brightness !== undefined ? layer.brightness : 100;
        ctx.filter = `hue-rotate(${hue}deg) saturate(${sat}%) brightness(${bright}%)`;
        ctx.globalAlpha = layer.opacity;

        if (layer.type === 'shape') {
            ctx.fillStyle = layer.color || '#fff';
            if (layer.shapeType === 'rect') {
                ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
            } else if (layer.shapeType === 'circle') {
                ctx.beginPath();
                ctx.arc(0, 0, layer.width / 2, 0, Math.PI * 2);
                ctx.fill();
            } else if (layer.shapeType === 'triangle') {
                ctx.beginPath();
                ctx.moveTo(0, -layer.height / 2);
                ctx.lineTo(layer.width / 2, layer.height / 2);
                ctx.lineTo(-layer.width / 2, layer.height / 2);
                ctx.closePath();
                ctx.fill();
            } else if (layer.shapeType === 'star') {
                const spikes = 5;
                const outerRadius = layer.width / 2;
                const innerRadius = outerRadius * 0.4;
                ctx.beginPath();
                for (let i = 0; i < spikes * 2; i++) {
                    const radius = i % 2 === 0 ? outerRadius : innerRadius;
                    const angle = (i * Math.PI) / spikes - Math.PI / 2;
                    const x = radius * Math.cos(angle);
                    const y = radius * Math.sin(angle);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
            } else if (layer.shapeType === 'arrow') {
                const w = layer.width / 2;
                const h = layer.height / 2;
                ctx.beginPath();
                ctx.moveTo(-w, -h * 0.3);
                ctx.lineTo(w * 0.3, -h * 0.3);
                ctx.lineTo(w * 0.3, -h);
                ctx.lineTo(w, 0);
                ctx.lineTo(w * 0.3, h);
                ctx.lineTo(w * 0.3, h * 0.3);
                ctx.lineTo(-w, h * 0.3);
                ctx.closePath();
                ctx.fill();
            } else if (layer.shapeType === 'diamond') {
                ctx.beginPath();
                ctx.moveTo(0, -layer.height / 2);
                ctx.lineTo(layer.width / 2, 0);
                ctx.lineTo(0, layer.height / 2);
                ctx.lineTo(-layer.width / 2, 0);
                ctx.closePath();
                ctx.fill();
            } else if (layer.shapeType === 'hexagon') {
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (i * Math.PI) / 3;
                    const x = (layer.width / 2) * Math.cos(angle);
                    const y = (layer.height / 2) * Math.sin(angle);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
            } else if (layer.shapeType === 'octagon') {
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const angle = (i * Math.PI) / 4 + Math.PI / 8;
                    const x = (layer.width / 2) * Math.cos(angle);
                    const y = (layer.height / 2) * Math.sin(angle);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
            } else if (layer.shapeType === 'heart') {
                const w = layer.width;
                const h = layer.height;
                ctx.beginPath();
                ctx.moveTo(0, h / 4);
                ctx.bezierCurveTo(0, h / 4, -w / 2, -h / 2, -w / 2, h / 4);
                ctx.bezierCurveTo(-w / 2, h / 4 + h / 4, 0, h - h / 4, 0, h);
                ctx.bezierCurveTo(0, h - h / 4, w / 2, h / 4 + h / 4, w / 2, h / 4);
                ctx.bezierCurveTo(w / 2, -h / 2, 0, h / 4, 0, h / 4);
                ctx.translate(0, -h / 2);
                ctx.fill();
            } else if (layer.shapeType === 'cross') {
                const w = layer.width / 2;
                const h = layer.height / 2;
                const th = w * 0.4;
                ctx.beginPath();
                ctx.rect(-th / 2, -h, th, h * 2);
                ctx.rect(-w, -th / 2, w * 2, th);
                ctx.fill();
            } else if (layer.shapeType === 'moon') {
                ctx.beginPath();
                ctx.arc(0, 0, layer.width / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath();
                ctx.arc(layer.width * 0.3, -layer.height * 0.1, layer.width / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            } else if (layer.shapeType === 'sun') {
                const spikes = 12;
                const outer = layer.width / 2;
                const inner = outer * 0.6;
                ctx.beginPath();
                for (let i = 0; i < spikes * 2; i++) {
                    const r = i % 2 === 0 ? outer : inner;
                    const a = (i * Math.PI) / spikes;
                    ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
                }
                ctx.closePath();
                ctx.fill();
            } else if (layer.shapeType === 'cloud') {
                const w = layer.width;
                const h = layer.height;
                ctx.beginPath();
                ctx.arc(-w * 0.2, h * 0.1, w * 0.25, 0, Math.PI * 2);
                ctx.arc(w * 0.1, -h * 0.1, w * 0.3, 0, Math.PI * 2);
                ctx.arc(w * 0.35, h * 0.1, w * 0.2, 0, Math.PI * 2);
                ctx.rect(-w * 0.2, h * 0.1, w * 0.55, h * 0.2);
                ctx.fill();
            } else if (layer.shapeType === 'shield') {
                const w = layer.width / 2;
                const h = layer.height / 2;
                ctx.beginPath();
                ctx.moveTo(0, -h);
                ctx.lineTo(w, -h * 0.7);
                ctx.lineTo(w, 0);
                ctx.quadraticCurveTo(w, h, 0, h * 1.2);
                ctx.quadraticCurveTo(-w, h, -w, 0);
                ctx.lineTo(-w, -h * 0.7);
                ctx.closePath();
                ctx.fill();
            } else if (layer.shapeType === 'lightning') {
                const w = layer.width / 2;
                const h = layer.height / 2;
                ctx.beginPath();
                ctx.moveTo(w * 0.2, -h);
                ctx.lineTo(-w, h * 0.2);
                ctx.lineTo(w * 0.1, h * 0.2);
                ctx.lineTo(-w * 0.1, h);
                ctx.lineTo(w, -h * 0.2);
                ctx.lineTo(-w * 0.1, -h * 0.2);
                ctx.closePath();
                ctx.fill();
            } else if (layer.shapeType === 'gear') {
                const spikes = 8;
                const outer = layer.width / 2;
                const inner = outer * 0.7;
                const hole = outer * 0.3;
                ctx.beginPath();
                for (let i = 0; i < spikes; i++) {
                    const a = (i * Math.PI * 2) / spikes;
                    const aNext = ((i + 0.5) * Math.PI * 2) / spikes;
                    const aEnd = ((i + 1) * Math.PI * 2) / spikes;
                    ctx.arc(0, 0, outer, a, aNext);
                    ctx.lineTo(inner * Math.cos(aNext), inner * Math.sin(aNext));
                    ctx.arc(0, 0, inner, aNext, aEnd);
                }
                ctx.closePath();
                ctx.fill();
                // Hole
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath();
                ctx.arc(0, 0, hole, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            } else if (layer.shapeType === 'flame') {
                const w = layer.width;
                const h = layer.height;
                ctx.beginPath();
                ctx.moveTo(0, h / 2);
                ctx.quadraticCurveTo(w / 2, h / 2, w / 2, 0);
                ctx.quadraticCurveTo(w / 2, -h / 2, 0, -h / 2);
                ctx.quadraticCurveTo(-w / 4, -h / 4, 0, 0);
                ctx.quadraticCurveTo(-w / 2, h / 4, 0, h / 2);
                ctx.fill();
            } else if (layer.shapeType === 'check') {
                const w = layer.width / 2;
                const h = layer.height / 2;
                ctx.beginPath();
                ctx.moveTo(-w, 0);
                ctx.lineTo(-w * 0.2, h);
                ctx.lineTo(w, -h);
                ctx.stroke(); // Use stroke for checkmark? No, let's fill a thick path
                ctx.lineWidth = w * 0.4;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = layer.color;
                ctx.stroke();
            } else if (layer.shapeType === 'plus') {
                const w = layer.width / 2;
                const thickness = w * 0.4;
                ctx.fillRect(-thickness / 2, -w, thickness, w * 2);
                ctx.fillRect(-w, -thickness / 2, w * 2, thickness);
            } else if (layer.shapeType === 'minus') {
                const w = layer.width / 2;
                const thickness = w * 0.4;
                ctx.fillRect(-w, -thickness / 2, w * 2, thickness);
            } else if (layer.shapeType === 'semicircle') {
                ctx.beginPath();
                ctx.arc(0, 0, layer.width / 2, 0, Math.PI, true);
                ctx.closePath();
                ctx.fill();
            } else if (layer.shapeType === 'trapezoid') {
                const w = layer.width / 2;
                const h = layer.height / 2;
                ctx.beginPath();
                ctx.moveTo(-w * 0.6, -h);
                ctx.lineTo(w * 0.6, -h);
                ctx.lineTo(w, h);
                ctx.lineTo(-w, h);
                ctx.closePath();
                ctx.fill();
            } else if (layer.shapeType === 'parallelogram') {
                const w = layer.width / 2;
                const h = layer.height / 2;
                ctx.beginPath();
                ctx.moveTo(-w * 0.6, -h);
                ctx.lineTo(w, -h);
                ctx.lineTo(w * 0.6, h);
                ctx.lineTo(-w, h);
                ctx.closePath();
            }
        } else if (layer.type === 'path') {
            if (layer.points.length >= 1) {
                ctx.beginPath();
                const p0 = layer.points[0];
                ctx.moveTo(p0.x, p0.y);

                for (let i = 0; i < layer.points.length - 1; i++) {
                    const pA = layer.points[i];
                    const pB = layer.points[i + 1];
                    if (pA.cp2 && pB.cp1) {
                        ctx.bezierCurveTo(pA.cp2.x, pA.cp2.y, pB.cp1.x, pB.cp1.y, pB.x, pB.y);
                    } else {
                        ctx.lineTo(pB.x, pB.y);
                    }
                }

                if (layer.closed && layer.points.length > 2) {
                    const pA = layer.points[layer.points.length - 1];
                    const pB = layer.points[0];
                    if (pA.cp2 && pB.cp1) {
                        ctx.bezierCurveTo(pA.cp2.x, pA.cp2.y, pB.cp1.x, pB.cp1.y, pB.x, pB.y);
                    } else {
                        ctx.lineTo(pB.x, pB.y);
                    }
                    ctx.closePath();
                    ctx.fillStyle = layer.color || this.brushColor;
                    ctx.globalAlpha = layer.opacity || 1;
                    ctx.fill();
                }

                ctx.strokeStyle = layer.color || this.brushColor;
                ctx.lineWidth = (layer.width || 2) / layer.scale;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();

                // Draw points and handles when in pen tool
                if (!skipUI && this.currentTool === 'pen' && layer.id === this.activeLayerId) {
                    layer.points.forEach((p, idx) => {
                        // Draw point
                        ctx.fillStyle = (idx === this.activePointIndex) ? '#fb923c' : '#3b82f6';
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, 6 / this.view.zoom, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 2 / this.view.zoom;
                        ctx.stroke();

                        // Draw Handles
                        if (p.cp1 || p.cp2) {
                            ctx.strokeStyle = '#94a3b8';
                            ctx.lineWidth = 1 / this.view.zoom;
                            if (p.cp1) {
                                ctx.beginPath();
                                ctx.moveTo(p.x, p.y);
                                ctx.lineTo(p.cp1.x, p.cp1.y);
                                ctx.stroke();
                                ctx.fillStyle = '#fff';
                                ctx.fillRect(p.cp1.x - 3 / this.view.zoom, p.cp1.y - 3 / this.view.zoom, 6 / this.view.zoom, 6 / this.view.zoom);
                            }
                            if (p.cp2) {
                                ctx.beginPath();
                                ctx.moveTo(p.x, p.y);
                                ctx.lineTo(p.cp2.x, p.cp2.y);
                                ctx.stroke();
                                ctx.fillStyle = '#fff';
                                ctx.fillRect(p.cp2.x - 3 / this.view.zoom, p.cp2.y - 3 / this.view.zoom, 6 / this.view.zoom, 6 / this.view.zoom);
                            }
                        }
                    });
                }
            }
        } else if (layer.type === 'text') {
            ctx.fillStyle = layer.color || '#fff';
            ctx.font = `${layer.fontSize}px ${layer.fontFamily || 'Outfit'}, sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';

            const curve = layer.curve || 0;
            const text = layer.text || '';
            const metrics = ctx.measureText(text);
            layer.width = metrics.width;
            layer.height = layer.fontSize;

            if (curve === 0) {
                ctx.fillText(text, 0, 0);
            } else {
                const textWidth = metrics.width;
                // Angle of the arc (curve of 100 = 180 degrees)
                const totalAngle = (curve / 100) * Math.PI;
                const radius = textWidth / totalAngle;

                ctx.save();
                // Move to center of arc
                ctx.translate(0, radius);

                let currentPos = -textWidth / 2;
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    const charWidth = ctx.measureText(char).width;

                    // Angle for this character
                    const charAngle = (currentPos + charWidth / 2) / radius;

                    ctx.save();
                    ctx.rotate(charAngle);
                    ctx.translate(0, -radius);
                    ctx.fillText(char, 0, 0);
                    ctx.restore();

                    currentPos += charWidth;
                }
                ctx.restore();
            }
        } else {
            // Paint, Image, or Raster (Tattoo) layers
            const source = (layer.canvas) ? layer.canvas : layer.img;

            if (layer.color && (layer.type === 'paint' || layer.type === 'raster')) {
                // Apply color tint for rasterized shapes/text
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = layer.width;
                tempCanvas.height = layer.height;
                const tempCtx = tempCanvas.getContext('2d');
                if (source) tempCtx.drawImage(source, 0, 0);
                tempCtx.globalCompositeOperation = 'source-in';
                tempCtx.fillStyle = layer.color;
                tempCtx.fillRect(0, 0, layer.width, layer.height);
                ctx.drawImage(tempCanvas, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
            } else if (source) {
                ctx.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
            }
        }

        ctx.restore();
    }

    drawGizmos(ctx, layer) {
        ctx.save();
        ctx.translate(layer.x, layer.y);
        ctx.rotate(layer.rotation);

        const w = layer.width * (layer.scaleX || layer.scale || 1);
        const h = layer.height * (layer.scaleY || layer.scale || 1);
        const hw = w / 2, hh = h / 2;

        const handleSize = 10 / this.view.zoom;
        const lineWidth = 2 / this.view.zoom;

        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(-hw, -hh, w, h);

        ctx.fillStyle = '#fff';
        const corners = [
            { x: -hw, y: -hh }, { x: hw, y: -hh },
            { x: hw, y: hh }, { x: -hw, y: hh }
        ];

        corners.forEach(p => {
            ctx.fillRect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize);
        });

        if (!this.isResizing) {
            ctx.beginPath();
            ctx.moveTo(0, -hh);
            ctx.lineTo(0, -hh - (25 / this.view.zoom));
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, -hh - (25 / this.view.zoom), handleSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    // ... Loaders ...
    async loadManifest() {
        try {
            const res = await fetch('Assets/manifest.json');
            this.manifest = await res.json();
            this.populateVehicles();
        } catch (e) {
            console.warn("Assets manifest not found", e);
        }
    }

    populateVehicles() {
        const sel = document.getElementById('vehicle-select');
        sel.innerHTML = '<option value="">-- Select Vehicle --</option>';
        if (this.manifest && this.manifest.vehicles) {
            this.manifest.vehicles.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.innerText = v.name;
                sel.appendChild(opt);
            });
        }
    }

    async detectBestSkinPath(vehicle) {
        const lower = `Assets/vehicles/${vehicle}/skinname.dds`;
        const upper = `Assets/vehicles/${vehicle}/SKINNAME.dds`;

        try {
            // Check lowercase first
            const resLower = await fetch(lower, { method: 'HEAD' });
            if (resLower.ok) return lower;

            // Check uppercase
            const resUpper = await fetch(upper, { method: 'HEAD' });
            if (resUpper.ok) return upper;
        } catch (e) {
            console.warn("Skin auto-detection failed, defaulting to lowercase", e);
        }
        return lower; // Default fallback
    }

    populateSkins(vehicle, selectedPath) {
        const sel = document.getElementById('skin-select');
        sel.innerHTML = '';
        sel.disabled = false;

        // Add the main detected option
        const opt = document.createElement('option');
        opt.value = selectedPath;
        opt.innerText = "Standard Template";
        sel.appendChild(opt);

        // Check manifest for extra skins (e.g. Ambulance, Cargo Box, etc.)
        if (this.manifest && this.manifest.vehicles) {
            const vehicleData = this.manifest.vehicles.find(v => v.id === vehicle);
            if (vehicleData && vehicleData.skins) {
                vehicleData.skins.forEach(s => {
                    const extraOpt = document.createElement('option');
                    extraOpt.value = `Assets/vehicles/${vehicle}/${s.file}`;
                    extraOpt.innerText = s.name;
                    sel.appendChild(extraOpt);
                });
            }
        }
    }

    async loadBaseSkin(path) {
        try {
            let response = await fetch(path);

            // Fallback: If lowercase failed, try uppercase (for GitHub Pages/Linux)
            if (!response.ok && path.includes('skinname.dds')) {
                const altPath = path.replace('skinname.dds', 'SKINNAME.dds');
                response = await fetch(altPath);
            }

            // Fallback 2: If uppercase failed (and we started with uppercase), try lowercase 'skinname.dds'
            if (!response.ok && path.includes('SKINNAME.dds')) {
                const altPath = path.replace('SKINNAME.dds', 'skinname.dds');
                response = await fetch(altPath);
            }

            if (!response.ok) {
                console.error(`Failed to load skin: ${path} (Status: ${response.status})`);
                throw new Error(`Template file not found. Ensure the Assets/vehicles/${path.split('/')[2]} folder contains 'skinname.dds' or 'SKINNAME.dds'.`);
            }

            const buffer = await response.arrayBuffer();

            // Decode DDS
            try {
                const ddsData = DDSDecoder.decode(buffer);
                const imageData = new ImageData(ddsData.data, ddsData.width, ddsData.height);

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = ddsData.width;
                tempCanvas.height = ddsData.height;
                tempCanvas.getContext('2d').putImageData(imageData, 0, 0);

                const img = new Image();
                img.src = tempCanvas.toDataURL();
                img.onload = () => this.setBaseLayer(img);
            } catch (decodeErr) {
                console.error("DDS Decode Error:", decodeErr);
                throw new Error("Unsupported Texture Format.\n\nThe file uses BC7 compression, which browsers cannot read.\n\nPlease convert this skin to DXT5 (BC3) format using Paint.NET or Photoshop and upload it manually.\n\nSee the guide for more information.");
            }

        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    handleBaseUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => this.setBaseLayer(img);
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    setBaseLayer(img, name = 'Base Texture') {
        this.virtualWidth = img.width;
        this.virtualHeight = img.height;

        const existingBase = this.layers.find(l => l.isBase);
        if (existingBase) {
            existingBase.img = img;
            existingBase.name = name;
            existingBase.width = img.width;
            existingBase.height = img.height;
            existingBase.x = img.width / 2;
            existingBase.y = img.height / 2;
            existingBase.flipX = false;
            existingBase.flipY = false;
        } else {
            this.layers.unshift({
                id: 'base', name: name, type: 'image', img: img,
                x: img.width / 2, y: img.height / 2, width: img.width, height: img.height,
                rotation: 0, opacity: 1, scale: 1, scaleX: 1, scaleY: 1,
                flipX: false, flipY: false,
                hue: 0, saturation: 100, brightness: 100,
                isBase: true, locked: true
            });
        }
        this.updateLayerList();
        this.resetView();
    }

    addLayerFromUpload(e) {
        if (!e.target.files || e.target.files.length === 0) return;
        this.addLayersFromFiles(e.target.files);
        e.target.value = ''; // Allow re-importing same file
    }

    addLayersFromFiles(fileList) {
        Array.from(fileList).forEach(file => {
            const isDDS = file.name.toLowerCase().endsWith('.dds');
            const reader = new FileReader();

            reader.onload = (event) => {
                if (isDDS) {
                    try {
                        const buffer = event.target.result;
                        const decoded = DDSDecoder.decode(buffer);

                        const canvas = document.createElement('canvas');
                        canvas.width = decoded.width;
                        canvas.height = decoded.height;
                        const ctx = canvas.getContext('2d');

                        const imageData = new ImageData(decoded.data, decoded.width, decoded.height);
                        ctx.putImageData(imageData, 0, 0);

                        const img = new Image();
                        img.onload = () => {
                            this.setBaseLayer(img, file.name); // Usually DDS is base, but we might want to support DDS layers too? Assumed base for now if DDS? Code assumed base.
                            this.render();
                        };
                        img.src = canvas.toDataURL();
                    } catch (err) {
                        alert("Error loading DDS: " + err.message);
                    }
                } else {
                    const img = new Image();
                    img.onload = () => {
                        const layer = {
                            id: Date.now() + Math.random(), // Ensure unique ID for batch imports
                            name: file.name, type: 'image', img: img,
                            x: this.virtualWidth / 2, y: this.virtualHeight / 2,
                            width: img.width, height: img.height,
                            rotation: 0, opacity: 1, scale: 1,
                            flipX: false, flipY: false,
                            hue: 0, saturation: 100, brightness: 100,
                            isBase: false, locked: false
                        };
                        this.layers.push(layer);
                        this.setActiveLayer(layer.id);
                        this.setTool('move');
                    };
                    img.src = event.target.result;
                }
            };

            if (isDDS) {
                reader.readAsArrayBuffer(file);
            } else {
                reader.readAsDataURL(file);
            }
        });
    }

    handleDrop(e) {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            this.addLayersFromFiles(e.dataTransfer.files);
        }
    }

    handlePaste(e) {
        if (e.clipboardData && e.clipboardData.items) {
            const items = e.clipboardData.items;
            const files = [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    files.push(blob);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                this.addLayersFromFiles(files);
            }
        }
    }

    copyActiveLayer() {
        if (!this.activeLayerId) return;
        const layer = this.layers.find(l => l.id === this.activeLayerId);
        if (!layer || layer.isBase) return;

        // Create deep copy for clipboard
        const clone = { ...layer };

        // Deep copy points for path layers
        if (layer.points) {
            clone.points = JSON.parse(JSON.stringify(layer.points));
        }

        // Handle paint layers
        if (layer.type === 'paint' && layer.canvas) {
            const back = document.createElement('canvas');
            back.width = layer.canvas.width;
            back.height = layer.canvas.height;
            back.getContext('2d').drawImage(layer.canvas, 0, 0);
            clone.cachedCanvasStart = back;
            delete clone.canvas;
            delete clone.ctx;
            delete clone.img; // remove preview
        }

        // Remove runtime unique props
        delete clone.id;
        delete clone.mirrorLayerId;

        this.clipboard = clone;
    }

    pasteLayer() {
        if (!this.clipboard) return;
        const source = this.clipboard;

        const layer = { ...source };
        layer.id = Date.now();
        layer.name = source.name + ' (Copy)';
        layer.x += 20;
        layer.y += 20;

        // Restore paint content
        if (layer.type === 'paint' && source.cachedCanvasStart) {
            const canvas = document.createElement('canvas');
            canvas.width = source.width;
            canvas.height = source.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(source.cachedCanvasStart, 0, 0);

            layer.canvas = canvas;
            layer.ctx = ctx;

            const img = new Image();
            img.src = canvas.toDataURL();
            layer.img = img;

            delete layer.cachedCanvasStart;
        }

        // Insert above active or at top
        const activeIndex = this.layers.findIndex(l => l.id === this.activeLayerId);
        if (activeIndex !== -1) {
            this.layers.splice(activeIndex + 1, 0, layer);
        } else {
            this.layers.push(layer);
        }

        this.setActiveLayer(layer.id);
        this.render();
        this.saveState();
    }

    exportImage() {
        try {
            const expCanvas = document.createElement('canvas');
            expCanvas.width = this.virtualWidth;
            expCanvas.height = this.virtualHeight;
            const expCtx = expCanvas.getContext('2d');

            this.layers.forEach(layer => this.drawLayer(expCtx, layer));

            const imageData = expCtx.getImageData(0, 0, expCanvas.width, expCanvas.height);
            const ddsBuffer = DDSEncoder.encode(imageData);
            const blob = new Blob([ddsBuffer], { type: 'application/octet-stream' });

            const link = document.createElement('a');
            const filenameObj = document.getElementById('export-name');
            const filename = (filenameObj && filenameObj.value) ? filenameObj.value : 'livery-skin';
            link.download = filename + '.dds';
            link.href = URL.createObjectURL(blob);
            link.click();
        } catch (e) {
            console.error(e);
            alert("Export failed: " + e.message);
        }
    }

    saveState() {
        // Remove any states after current index (when making new changes after undo)
        this.history = this.history.slice(0, this.historyIndex + 1);

        // Create a serializable clone of the layers
        const serializedLayers = this.layers.map(layer => {
            const clone = { ...layer };
            if (layer.type === 'image' && layer.img) {
                clone.imgSrc = layer.img.src;
                delete clone.img;
            }
            if (layer.type === 'paint' && layer.canvas) {
                clone.canvasData = layer.canvas.toDataURL();
                delete clone.canvas;
                delete clone.img; // Paint layers also have a preview img, remove it
            }
            return clone;
        });

        const state = {
            layers: serializedLayers,
            width: this.virtualWidth,
            height: this.virtualHeight
        };
        this.history.push(state);

        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    restoreState(state) {
        // Restore layers and dimensions from history
        this.layers = state.layers.map(layerData => {
            const layer = { ...layerData };

            if (layer.type === 'image' && layer.imgSrc) {
                const img = new Image();
                img.src = layer.imgSrc;
                layer.img = img;
            }

            if (layer.type === 'paint' && layer.canvasData) {
                const canvas = document.createElement('canvas');
                canvas.width = layer.width;
                canvas.height = layer.height;
                const ctx = canvas.getContext('2d');

                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0);
                    this.render();
                };
                img.src = layer.canvasData;

                layer.canvas = canvas;
                layer.ctx = ctx;
                layer.img = img; // Preview image for the layer list
            }

            return layer;
        });

        this.virtualWidth = state.width || 2048;
        this.virtualHeight = state.height || 2048;

        this.updateLayerList();
        this.render();
    }

    // --- Layer Mgmt ---
    setActiveLayer(id) {
        if (this.activeLayerId === id) return;
        this.activeLayerId = id;
        this.updateLayerList();
        this.updateControls();
        this.render();
    }

    updateLayerList() {
        const list = document.getElementById('layer-list');
        list.innerHTML = '';
        [...this.layers].reverse().forEach((layer, index) => {
            const el = document.createElement('div');
            const isSelected = this.selectedLayers.includes(layer.id);
            el.className = `layer-item ${layer.id === this.activeLayerId ? 'active' : ''} ${isSelected ? 'multi-selected' : ''} ${layer.hidden ? 'hidden' : ''}`;

            const visibilityIcon = layer.hidden ? '○' : '👁️';
            const visibilityBtn = `<div class="layer-visibility" onclick="event.stopPropagation(); window.app.toggleLayerVisibility(${layer.id})">${visibilityIcon}</div>`;

            el.innerHTML = `
                ${visibilityBtn}
                <div class="layer-name" ondblclick="event.stopPropagation(); window.app.startRenaming(${layer.id}, this)">${layer.name}</div>
                <div class="layer-actions">${layer.locked ? '🔒' : ''}${layer.mirrorOf ? '🔗' : ''}</div>
            `;
            el.onclick = (e) => {
                const isAlreadyActive = (this.activeLayerId === layer.id);

                if (e.ctrlKey || e.metaKey) {
                    const index = this.selectedLayers.indexOf(layer.id);
                    if (index > -1) {
                        this.selectedLayers.splice(index, 1);
                    } else {
                        this.selectedLayers.push(layer.id);
                    }
                    this.updateLayerList();
                } else {
                    if (!isAlreadyActive) {
                        this.selectedLayers = [];
                        this.setActiveLayer(layer.id);
                    }
                }
            };

            // Make draggable (except base layer)
            if (!layer.isBase) {
                el.draggable = true;
                el.dataset.layerId = layer.id;

                el.addEventListener('dragstart', (e) => {
                    el.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', layer.id);
                });

                el.addEventListener('dragend', () => {
                    el.classList.remove('dragging');
                    document.querySelectorAll('.layer-item').forEach(item => {
                        item.classList.remove('drag-over');
                    });
                });

                el.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    el.classList.add('drag-over');
                });

                el.addEventListener('dragleave', () => {
                    el.classList.remove('drag-over');
                });

                el.addEventListener('drop', (e) => {
                    e.preventDefault();
                    el.classList.remove('drag-over');

                    const draggedId = e.dataTransfer.getData('text/plain');
                    const targetId = layer.id;

                    if (draggedId !== targetId) {
                        this.reorderLayers(draggedId, targetId);
                    }
                });
            }

            list.appendChild(el);
        });

        // Update lock button icon
        const lockBtn = document.getElementById('toggle-lock-btn');
        if (lockBtn && this.activeLayerId) {
            const activeLayer = this.layers.find(l => l.id === this.activeLayerId);
            lockBtn.innerText = (activeLayer && activeLayer.locked) ? '🔒' : '🔓';
        }
    }

    reorderLayers(draggedId, targetId) {
        const draggedIndex = this.layers.findIndex(l => l.id == draggedId);
        const targetIndex = this.layers.findIndex(l => l.id == targetId);

        if (draggedIndex === -1 || targetIndex === -1) return;

        // Remove dragged layer
        const [draggedLayer] = this.layers.splice(draggedIndex, 1);

        // Insert at target position
        // If dragging down, insert after target; if dragging up, insert before
        const newTargetIndex = this.layers.findIndex(l => l.id == targetId);
        this.layers.splice(newTargetIndex, 0, draggedLayer);

        this.updateLayerList();
        this.render();
    }

    updateControls() {
        const layer = this.layers.find(l => l.id === this.activeLayerId);
        if (layer) {
            document.getElementById('prop-opacity').value = (layer.opacity ?? 1) * 100;
            const deg = Math.round((layer.rotation || 0) * (180 / Math.PI));
            document.getElementById('prop-rotation').value = deg;
            document.getElementById('prop-rotation-slider').value = deg;

            // Show average or X scale if non-uniform
            const s = layer.scaleX || layer.scale || 1;
            document.getElementById('prop-scale').value = s;

            document.getElementById('prop-hue').value = layer.hue || 0;
            document.getElementById('prop-saturation').value = layer.saturation !== undefined ? layer.saturation : 100;
            document.getElementById('prop-brightness').value = layer.brightness !== undefined ? layer.brightness : 100;

            const pathSettings = document.getElementById('path-settings');
            if (layer.type === 'path') {
                pathSettings.style.display = 'block';
                document.getElementById('prop-path-width').value = layer.width || 2;
                document.getElementById('prop-path-closed').checked = !!layer.closed;
            } else {
                pathSettings.style.display = 'none';
            }

            const textSettings = document.getElementById('text-settings');
            if (layer.type === 'text') {
                textSettings.style.display = 'block';
                document.getElementById('prop-text-content').value = layer.text || '';
                document.getElementById('prop-text-font').value = layer.fontFamily || 'Outfit';
                document.getElementById('prop-text-size').value = layer.fontSize || 100;
                document.getElementById('prop-text-curve').value = layer.curve || 0;
                document.getElementById('prop-text-curve-num').value = layer.curve || 0;
            } else {
                textSettings.style.display = 'none';
            }

            const lockBtn = document.getElementById('toggle-lock-btn');
            if (lockBtn) {
                lockBtn.innerText = layer.locked ? '🔒' : '🔓';
            }

            // Sync universal color picker if the layer has a color
            if (layer.color) {
                this.brushColor = layer.color;
                document.getElementById('brush-color').value = layer.color;
                document.getElementById('fg-color-display').style.background = layer.color;
            }
        }

        const panel = document.getElementById('properties-panel');
        if (layer) {
            panel.style.opacity = '1';
            panel.style.pointerEvents = 'all';
        } else {
            panel.style.opacity = '0.5';
            panel.style.pointerEvents = 'none';
        }
    }

    updateActiveLayer(prop, value) {
        if (!this.activeLayerId) return;
        const layer = this.layers.find(l => l.id === this.activeLayerId);
        if (!layer) return;
        if (prop === 'html-rotation') {
            layer.rotation = value * (Math.PI / 180);
        } else if (prop === 'scale') {
            // Uniform scale update from UI
            layer.scale = value;
            layer.scaleX = value;
            layer.scaleY = value;
        } else {
            layer[prop] = value;
        }

        // Update linked mirror if exists
        if (layer.mirrorLayerId) {
            const mirror = this.layers.find(l => l.id === layer.mirrorLayerId);
            if (mirror) {
                if (prop === 'html-rotation' || prop === 'rotation') {
                    mirror.rotation = -layer.rotation;
                } else if (prop === 'x') {
                    mirror.x = mirror.mirrorAxis === 'h' ? this.virtualWidth - value : value;
                } else if (prop === 'y') {
                    mirror.y = mirror.mirrorAxis === 'v' ? this.virtualHeight - value : value;
                } else if (prop !== 'flipX' && prop !== 'flipY') {
                    mirror[prop] = value;
                }
            }
        }

        this.updateControls();
        this.render();
    }

    flipActiveLayer(axis) {
        if (!this.activeLayerId) return;
        const layer = this.layers.find(l => l.id === this.activeLayerId);
        if (!layer) return;
        if (axis === 'h') layer.flipX = !layer.flipX;
        if (axis === 'v') layer.flipY = !layer.flipY;
        this.render();
    }

    createMirrorLayer(axis) {
        if (!this.activeLayerId) return;
        const sourceLayer = this.layers.find(l => l.id === this.activeLayerId);
        if (!sourceLayer || sourceLayer.isBase) return;

        // Create mirrored copy
        const mirrorLayer = {
            ...sourceLayer,
            id: Date.now(),
            name: `${sourceLayer.name} (Mirror ${axis.toUpperCase()})`,
            mirrorOf: sourceLayer.id,
            mirrorAxis: axis,
            flipX: axis === 'h' ? !sourceLayer.flipX : sourceLayer.flipX,
            flipY: axis === 'v' ? !sourceLayer.flipY : sourceLayer.flipY,
            x: axis === 'h' ? this.virtualWidth - sourceLayer.x : sourceLayer.x,
            y: axis === 'v' ? this.virtualHeight - sourceLayer.y : sourceLayer.y
        };

        // Mark source as having a mirror
        sourceLayer.hasMirror = true;
        sourceLayer.mirrorLayerId = mirrorLayer.id;

        this.layers.push(mirrorLayer);
        this.updateLayerList();
        this.render();
    }

    toggleLockActiveLayer() {
        if (!this.activeLayerId) return;
        const layer = this.layers.find(l => l.id === this.activeLayerId);
        if (!layer || layer.isBase) return;
        layer.locked = !layer.locked;
        this.updateLayerList();
        this.updateControls();
    }

    duplicateActiveLayer() {
        if (!this.activeLayerId) return;
        const originalIndex = this.layers.findIndex(l => l.id === this.activeLayerId);
        if (originalIndex === -1) return;
        const original = this.layers[originalIndex];
        if (original.isBase) return;

        // Deep copy
        const clone = { ...original };
        clone.id = Date.now();
        clone.name = original.name + ' (Copy)';
        clone.x += 20; // Offset slightly
        clone.y += 20;

        // Push to top or above original?
        // Layers array: index 0 is BACKGROUND (Base), last index is TOP
        // To put it above original, splice it at originalIndex + 1
        this.layers.splice(originalIndex + 1, 0, clone);

        this.setActiveLayer(clone.id);
    }

    reorderActiveLayer(dir) {
        if (!this.activeLayerId) return;
        const index = this.layers.findIndex(l => l.id === this.activeLayerId);
        if (index === -1) return;

        // Prevent moving base (index 0 usually, or find isBase)
        // Also prevent moving below base

        const item = this.layers[index];
        if (item.isBase) return;

        this.layers.splice(index, 1);
        if (dir === 'front') {
            this.layers.push(item);
        } else {
            // Find base index
            const baseIndex = this.layers.findIndex(l => l.isBase);
            // Insert after base
            this.layers.splice(baseIndex + 1, 0, item);
        }
        this.render();
        this.updateLayerList();
    }

    deleteActiveLayer() {
        if (!this.activeLayerId) return;
        const index = this.layers.findIndex(l => l.id === this.activeLayerId);
        if (index !== -1 && !this.layers[index].isBase) {
            this.layers.splice(index, 1);
            this.activeLayerId = null;
            this.render();
            this.updateLayerList();
            this.updateControls();
        }
    }

    toggleLayerVisibility(id) {
        const layer = this.layers.find(l => l.id === id);
        if (layer) {
            layer.hidden = !layer.hidden;
            this.render();
            this.updateLayerList();
        }
    }

    startRenaming(id, el) {
        const layer = this.layers.find(l => l.id === id);
        if (!layer) return;

        const originalName = layer.name;
        el.innerHTML = `<input type="text" class="layer-rename-input" value="${originalName}">`;
        const input = el.querySelector('input');
        input.focus();
        input.select();

        input.onclick = (e) => e.stopPropagation();
        input.onmousedown = (e) => e.stopPropagation();

        const finish = () => {
            const newName = input.value.trim() || originalName;
            layer.name = newName;
            this.updateLayerList();
        };

        input.onblur = finish;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') finish();
            if (e.key === 'Escape') {
                input.value = originalName;
                finish();
            }
        };
    }

    rasterizeActiveLayer() {
        if (!this.activeLayerId) return;
        const index = this.layers.findIndex(l => l.id === this.activeLayerId);
        const layer = this.layers[index];
        if (!layer || layer.isBase || layer.type === 'paint' || layer.type === 'raster') {
            alert("This layer cannot be rasterized (or is already a raster layer).");
            return;
        }

        // Create a temporary full-size canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.virtualWidth;
        tempCanvas.height = this.virtualHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw ONLY the active layer onto this canvas
        this.ctx.save();
        this.drawLayer(tempCtx, layer, true); // skipUI = true

        // Scan for pixel bounds
        const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        let minX = tempCanvas.width, minY = tempCanvas.height, maxX = 0, maxY = 0;
        let found = false;

        for (let y = 0; y < tempCanvas.height; y++) {
            for (let x = 0; x < tempCanvas.width; x++) {
                const alpha = imgData.data[(y * tempCanvas.width + x) * 4 + 3];
                if (alpha > 5) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                    found = true;
                }
            }
        }

        if (!found) {
            alert("Layer is empty, nothing to rasterize.");
            return;
        }

        // Add padding
        const pad = 2;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(tempCanvas.width - 1, maxX + pad);
        maxY = Math.min(tempCanvas.height - 1, maxY + pad);

        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;

        // Create cropped canvas
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(tempCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

        const cropImg = new Image();
        cropImg.src = cropCanvas.toDataURL();

        // Convert to a raster layer (Tattoo)
        const rasterLayer = {
            id: Date.now(),
            name: `${layer.name} (Tattoo)`,
            type: 'raster',
            x: minX + cropW / 2,
            y: minY + cropH / 2,
            width: cropW,
            height: cropH,
            rotation: 0,
            opacity: layer.opacity || 1,
            scale: 1,
            flipX: false,
            flipY: false,
            canvas: cropCanvas,
            ctx: cropCtx,
            img: cropImg,
            isBase: false,
            locked: false, // Start unlocked so user can resize immediately
            color: layer.color || null,
            hue: 0,
            saturation: 100,
            brightness: 100
        };

        // Replace original layer
        this.layers.splice(index, 1, rasterLayer);
        this.saveState();
        this.setActiveLayer(rasterLayer.id);
        this.render();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new LiveryEditor();
});
