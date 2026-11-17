// BeamNG Livery Studio: the editor. Fabric.js draws and edits everything; this file adds the document (the skin
// texture), the template, tools, layers, properties, history, projects and DDS import / export.
import * as fabric from "fabric";
import { EraserBrush } from "@erase2d/fabric";
import { SHAPES } from "./shapes.js";
import { openZip, readHead } from "./zip.js";

const $ = id => document.getElementById(id);
const VERSION = "0.4.0";
const FONTS = ["Outfit", "Inter", "Anton", "Bebas Neue", "Black Ops One", "Bangers", "Audiowide", "Orbitron", "Oswald",
    "Permanent Marker", "Racing Sans One", "Russo One", "Teko", "Pacifico", "Roboto Condensed", "Arial", "Impact",
    "Georgia", "Times New Roman", "Courier New", "Verdana"];

// ---------- fabric setup ----------
fabric.FabricObject.customProperties = ["uid", "name", "layerType", "locked", "mirrorOf", "mirrorAxis", "textCurve",
    "fillKind", "fill1", "fill2", "gradAngle", "gradMid", "adjust", "erasable"];
Object.assign(fabric.InteractiveFabricObject.ownDefaults, {
    transparentCorners: false, cornerColor: "#ffffff", cornerStrokeColor: "#f97316", cornerStyle: "circle",
    cornerSize: 11, borderColor: "#f97316", borderScaleFactor: 1.5, padding: 2, objectCaching: true,
});
fabric.setFilterBackend(new fabric.Canvas2dFilterBackend());   // big skins exceed WebGL texture limits

const uid = () => Math.random().toString(36).slice(2, 10);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b);
    return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
const toHex = c => { try { return "#" + new fabric.Color(c).toHex(); } catch { return "#ffffff"; } };

function toast(msg, isError = false, ms = 3500) {
    const t = $("toast");
    t.textContent = msg; t.classList.toggle("error", isError); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms);
}

// ---------- the studio ----------
class Studio {
    constructor() {
        this.W = 2048; this.H = 2048;
        this.hasDoc = false;
        this.vehicle = null;           // {id, name, source}
        this.tool = "select";
        this.shape = "rect";
        this.snap = true;
        this.overlay = false;           // template drawn on top of the artwork
        this.template = null;
        this.history = []; this.hIndex = -1; this.restoring = false;
        this.clipboard = null;
        this.guides = [];
        this.pen = null;
        this.space = false;
        this.manifest = null;

        const stage = $("stage");
        this.canvas = new fabric.Canvas($("c"), {
            preserveObjectStacking: true, controlsAboveOverlay: true, stopContextMenu: false, fireRightClick: true,
            selectionColor: "rgba(249,115,22,.08)", selectionBorderColor: "#f97316", selectionLineWidth: 1,
            targetFindTolerance: 4, uniformScaling: true, uniScaleKey: "shiftKey", centeredKey: "altKey",
        });
        this.resize();
        new ResizeObserver(() => this.resize()).observe(stage);
        this.initCanvasEvents();
        this.initUI();
        this.setTool("select");
        this.loadManifest();
        this.restoreAutosave();
    }

    // ---------- document & view ----------
    get zoom() { return this.canvas.getZoom(); }

    resize() {
        const s = $("stage");
        this.canvas.setDimensions({ width: s.clientWidth, height: s.clientHeight });
        this.canvas.requestRenderAll();
    }

    setDocSize(W, H) {
        this.W = W; this.H = H;
        this.canvas.clipPath = new fabric.Rect({ left: W / 2, top: H / 2, width: W, height: H, absolutePositioned: true });
        $("doc-size").textContent = ` · ${W} × ${H}`;
        $("status-doc").textContent = `${W} × ${H} px`;
    }

    fit() {
        const s = $("stage"), pad = 40;
        const z = Math.min((s.clientWidth - pad * 2) / this.W, (s.clientHeight - pad * 2) / this.H);
        this.canvas.setViewportTransform([z, 0, 0, z, (s.clientWidth - this.W * z) / 2, (s.clientHeight - this.H * z) / 2]);
        this.updateZoomLabel();
    }

    zoomTo(z, point) {
        z = clamp(z, 0.02, 32);
        const s = $("stage");
        point = point || new fabric.Point(s.clientWidth / 2, s.clientHeight / 2);
        this.canvas.zoomToPoint(point, z);
        this.updateZoomLabel();
    }

    updateZoomLabel() { $("zoom-label").textContent = Math.round(this.zoom * 100) + "%"; }

    // checkerboard under the texture, the texture's edge and snapping guides
    drawBackdrop(ctx) {
        if (!this.hasDoc) return;
        const v = this.canvas.viewportTransform;
        const x = v[4], y = v[5], w = this.W * v[0], h = this.H * v[3];
        if (!this.checker) {
            const c = document.createElement("canvas"); c.width = c.height = 16;
            const g = c.getContext("2d");
            g.fillStyle = "#2b2e36"; g.fillRect(0, 0, 16, 16);
            g.fillStyle = "#353943"; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
            this.checker = ctx.createPattern(c, "repeat");
        }
        ctx.save();
        ctx.fillStyle = this.checker;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
    }

    drawOverlay(ctx) {
        if (!this.hasDoc) return;
        const v = this.canvas.viewportTransform;
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 1;
        ctx.strokeRect(v[4] - .5, v[5] - .5, this.W * v[0] + 1, this.H * v[3] + 1);
        ctx.strokeStyle = "#f97316"; ctx.setLineDash([5, 4]);
        for (const gd of this.guides) {
            ctx.beginPath();
            if (gd.x != null) { const X = gd.x * v[0] + v[4]; ctx.moveTo(X, v[5]); ctx.lineTo(X, v[5] + this.H * v[3]); }
            else { const Y = gd.y * v[3] + v[5]; ctx.moveTo(v[4], Y); ctx.lineTo(v[4] + this.W * v[0], Y); }
            ctx.stroke();
        }
        if (this.pen) this.drawPenHandles(ctx, v);
        ctx.restore();
    }

    // ---------- template ----------
    async setTemplate(source, { name = "Template", vehicle = null, size = null } = {}) {
        // source: an <img>, <canvas> or ImageBitmap. size: the skin's real size when the template image is smaller
        const el = source instanceof HTMLCanvasElement || source instanceof HTMLImageElement ? source : this.toCanvas(source);
        const W = size ? size[0] : el.width, H = size ? size[1] : el.height;
        const keep = this.layerObjects().length > 0;
        this.setDocSize(W, H);
        if (this.template) this.canvas.remove(this.template);
        const src = el instanceof HTMLCanvasElement ? el.toDataURL("image/png") : el.src;
        const img = await fabric.FabricImage.fromURL(src);
        img.set({ left: W / 2, top: H / 2, scaleX: W / img.width, scaleY: H / img.height, selectable: false,
            evented: false, name, layerType: "template", uid: "template", objectCaching: false });
        img.isTemplate = true;
        this.template = img;
        this.canvas.insertAt(this.overlay ? this.canvas.getObjects().length : 0, img);
        this.applyOverlay();
        this.hasDoc = true;
        $("empty-state").hidden = true;
        if (vehicle) this.vehicle = vehicle;
        $("doc-vehicle").textContent = this.vehicle ? `${this.vehicle.name} · ${name}` : name;
        if (this.vehicle && !keep) $("exp-name").value = `${this.vehicle.id}_skin_mylivery`;
        this.fit();
        this.refreshLayers();
        this.commit(true);
        $("status-hint").textContent = "Template loaded. Draw with the tools on the left; layers are on the right.";
    }

    toCanvas(bitmap) {
        const c = document.createElement("canvas");
        c.width = bitmap.width; c.height = bitmap.height;
        c.getContext("2d").drawImage(bitmap, 0, 0);
        return c;
    }

    applyOverlay() {
        const t = this.template;
        if (!t) return;
        const objs = this.canvas.getObjects();
        if (this.overlay) {
            this.canvas.moveObjectTo(t, objs.length - 1);
            t.set({ globalCompositeOperation: "multiply" });
        } else {
            this.canvas.moveObjectTo(t, 0);
            t.set({ globalCompositeOperation: "source-over" });
        }
        $("menu-overlay").classList.toggle("on", this.overlay);
        this.canvas.requestRenderAll();
    }

    // ---------- objects ----------
    layerObjects() { return this.canvas.getObjects().filter(o => !o.isTemplate && !o.isHelper); }

    addObject(obj, { select = true, name } = {}) {
        if (!obj.uid) obj.uid = uid();
        if (name) obj.name = name;
        if (!obj.name) obj.name = this.defaultName(obj);
        obj.erasable = true;
        const objs = this.canvas.getObjects();
        // above the current selection, below the template when it is drawn on top
        let idx = objs.length;
        if (this.overlay && this.template) idx = objs.indexOf(this.template);
        const active = this.canvas.getActiveObject();
        if (active && !active.isType?.("ActiveSelection") && objs.includes(active)) idx = Math.min(idx, objs.indexOf(active) + 1);
        this.canvas.insertAt(idx, obj);
        if (select) this.canvas.setActiveObject(obj);
        this.canvas.requestRenderAll();
        this.commit();
        return obj;
    }

    defaultName(o) {
        if (o.layerType === "paint") return "Paint";
        if (o.isType("IText", "FabricText", "Textbox")) return "Text";
        if (o.type === "image") return "Image";
        if (o.type === "group") return "Group";
        if (o.type === "line") return "Line";
        return "Shape";
    }

    selected() {
        const a = this.canvas.getActiveObject();
        if (!a) return [];
        return a.isType("ActiveSelection") ? a.getObjects() : [a];
    }

    // ---------- history & autosave ----------
    // An object as JSON in the canvas plane: objects inside a multi-selection otherwise report positions
    // relative to the selection
    serialize(o) { return this.canvas._toObject(o, "toObject", []); }

    async cloneObj(o) { return (await fabric.util.enlivenObjects([this.serialize(o)]))[0]; }

    snapshot() {
        return JSON.stringify({ W: this.W, H: this.H, objects: this.layerObjects().map(o => this.serialize(o)) });
    }

    commit(reset = false) {
        if (this.restoring) return;
        const s = this.snapshot();
        if (!reset && this.history[this.hIndex] === s) return;
        if (reset) { this.history = []; this.hIndex = -1; }
        this.history = this.history.slice(0, this.hIndex + 1);
        this.history.push(s);
        if (this.history.length > 60) this.history.shift();
        this.hIndex = this.history.length - 1;
        this.refreshLayers();
        this.autosave();
    }
    commitSoon = debounce(() => this.commit(), 250);

    async restore(s) {
        this.restoring = true;
        const data = JSON.parse(s);
        this.canvas.discardActiveObject();
        this.layerObjects().forEach(o => this.canvas.remove(o));
        const objs = await fabric.util.enlivenObjects(data.objects);
        // web fonts must be in before text is measured, or it is laid out in a fallback font
        const texts = [];
        const walk = list => list.forEach(o => { if (o.isType?.("IText", "FabricText", "Textbox")) texts.push(o); if (o.getObjects) walk(o.getObjects()); });
        walk(objs);
        await Promise.all([...new Set(texts.map(t => t.fontFamily))].map(loadFont));
        texts.forEach(t => { t.initDimensions(); t.setCoords(); });
        const base = this.overlay ? 0 : (this.template ? 1 : 0);
        objs.forEach((o, i) => this.canvas.insertAt(base + i, o));
        this.applyOverlay();
        this.restoring = false;
        this.canvas.requestRenderAll();
        this.refreshLayers();
        this.updateProps();
        this.autosave();
    }

    undo() { if (this.hIndex > 0) { this.hIndex--; this.restore(this.history[this.hIndex]); } }
    redo() { if (this.hIndex < this.history.length - 1) { this.hIndex++; this.restore(this.history[this.hIndex]); } }

    projectJSON(withTemplate = true) {
        return JSON.stringify({
            app: "beamng-livery-studio", version: VERSION, W: this.W, H: this.H, vehicle: this.vehicle,
            template: this.template ? { name: this.template.name, src: withTemplate ? this.template.getSrc() : null } : null,
            overlay: this.overlay, exportName: $("exp-name").value,
            objects: this.layerObjects().map(o => this.serialize(o)),
        });
    }

    async loadProject(json) {
        const p = typeof json === "string" ? JSON.parse(json) : json;
        if (p.app !== "beamng-livery-studio") throw new Error("Not a Livery Studio project");
        this.vehicle = p.vehicle || null;
        this.overlay = !!p.overlay;
        if (p.exportName) $("exp-name").value = p.exportName;
        if (p.template) {
            const img = new Image();
            img.src = p.template.src;
            await img.decode();
            this.restoring = true;
            await this.setTemplate(img, { name: p.template.name, size: [p.W, p.H] });
            this.restoring = false;
        } else {
            this.setDocSize(p.W, p.H); this.hasDoc = true; $("empty-state").hidden = true; this.fit();
        }
        await this.restore(JSON.stringify({ objects: p.objects }));
        this.commit(true);
    }

    autosave = debounce(async () => {
        if (!this.hasDoc) return;
        try {
            const src = this.template?.getSrc();
            if (src && src !== this.savedTemplate) { await idbSet("autosave-template", src); this.savedTemplate = src; }
            await idbSet("autosave", this.projectJSON(false));
            $("status-save").textContent = "Saved in this browser " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        } catch (e) { $("status-save").textContent = "Couldn't autosave: " + e.message; }
    }, 1500);

    async restoreAutosave() {
        try {
            const s = await idbGet("autosave");
            if (!s) return;
            const p = JSON.parse(s);
            if (p.template && !p.template.src) p.template.src = this.savedTemplate = await idbGet("autosave-template");
            if (p.template && !p.template.src) p.template = null;
            await this.loadProject(p);
            toast("Restored your last session. File › Choose template starts a new one.");
        } catch (e) { console.warn("autosave restore failed", e); }
    }

    // ---------- export ----------
    // The texture at 1:1 (or `scale`), rendered straight from the objects (no checkerboard, edge or guides)
    renderDoc({ template = false, hidden = false, only = null, scale = 1 } = {}) {
        const c = document.createElement("canvas");
        c.width = Math.round(this.W * scale); c.height = Math.round(this.H * scale);
        const ctx = c.getContext("2d");
        const cv = this.canvas, vpt = cv.viewportTransform.slice(), skip = cv.skipOffscreen;
        cv.viewportTransform = [scale, 0, 0, scale, 0, 0];
        cv.skipOffscreen = false;
        cv.calcViewportBoundaries();
        ctx.scale(scale, scale);
        for (const o of cv.getObjects()) {
            if (o.isHelper) continue;
            if (only && !only(o)) continue;
            if (o.isTemplate && !template) continue;
            const vis = o.visible;
            if (!vis && !hidden) continue;
            if (!vis) o.visible = true;
            o.render(ctx);
            o.visible = vis;
        }
        cv.skipOffscreen = skip;
        cv.setViewportTransform(vpt);
        return c;
    }

    exportSkin() {
        const name = ($("exp-name").value || "livery").replace(/[^\w.-]+/g, "_");
        const c = this.renderDoc({ template: $("exp-template").checked, hidden: $("exp-hidden").checked });
        const fmt = $("exp-format").value;
        const save = (blob, ext) => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = `${name}.${ext}`; a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        };
        if (fmt === "png") c.toBlob(b => save(b, "png"), "image/png");
        else {
            const data = c.getContext("2d").getImageData(0, 0, c.width, c.height);
            save(new Blob([DDSEncoder.encode(data)], { type: "application/octet-stream" }), "dds");
        }
        toast(`Exported ${name}.${fmt}`);
    }

    // ---------- canvas events ----------
    initCanvasEvents() {
        const cv = this.canvas;
        cv.on("before:render", ({ ctx }) => this.drawBackdrop(ctx));
        cv.on("after:render", ({ ctx }) => this.drawOverlay(ctx));
        cv.on("selection:created", () => this.onSelection());
        cv.on("selection:updated", () => this.onSelection());
        cv.on("selection:cleared", () => this.onSelection());
        cv.on("object:modified", e => { this.syncMirror(e.target, true); this.guides = []; this.commit(); this.updateProps(); });
        for (const ev of ["object:moving", "object:scaling", "object:rotating", "object:skewing"]) {
            cv.on(ev, e => {
                if (ev === "object:moving") this.snapMove(e.target);
                this.syncMirror(e.target);
                this.updatePropsLive();
            });
        }
        cv.on("text:changed", e => { this.applyCurve(e.target); this.syncMirror(e.target, true); });
        cv.on("text:editing:exited", () => this.commit());
        cv.on("path:created", e => this.onPathCreated(e.path));
        cv.on("mouse:wheel", opt => {
            const e = opt.e;
            e.preventDefault(); e.stopPropagation();
            if (!this.hasDoc) return;
            this.zoomTo(this.zoom * Math.pow(0.9985, e.deltaY), new fabric.Point(e.offsetX, e.offsetY));
        });
        cv.on("mouse:down", opt => this.onDown(opt));
        cv.on("mouse:move", opt => this.onMove(opt));
        cv.on("mouse:up", opt => this.onUp(opt));
        cv.on("mouse:dblclick", opt => {
            if (this.tool === "pen" && this.pen) { this.finishPen(false); return; }
            const t = opt.target;
            if (t && this.tool === "select" && t.type === "path" && !t.isEditingPoints) this.toggleEditPoints(t);
        });
        $("stage").addEventListener("contextmenu", e => this.onContextMenu(e));
    }

    onSelection() {
        // leaving a path in point-editing mode when something else is picked
        for (const o of this.canvas.getObjects()) if (o.isEditingPoints && !this.selected().includes(o)) this.toggleEditPoints(o, false);
        this.guides = [];
        this.updateProps();
        this.refreshLayers(false);
    }

    scene(opt) { return opt.scenePoint || this.canvas.getScenePoint(opt.e); }

    onDown(opt) {
        const e = opt.e;
        this.hideContext();
        const panning = this.tool === "hand" || this.space || e.button === 1;
        if (panning) { this.pan = { x: e.clientX, y: e.clientY }; $("stage").classList.add("hand"); return; }
        if (!this.hasDoc || e.button === 2) return;
        const p = this.scene(opt);
        switch (this.tool) {
            case "shape": case "line": case "gradient": this.startDrag(p); break;
            case "pen": this.penDown(p); break;
            case "text": this.textDown(p, opt); break;
            case "fill": this.bucket(p); break;
            case "eyedropper": this.eyedrop(p); break;
        }
    }

    onMove(opt) {
        const e = opt.e;
        if (this.pan) {
            this.canvas.relativePan(new fabric.Point(e.clientX - this.pan.x, e.clientY - this.pan.y));
            this.pan = { x: e.clientX, y: e.clientY };
            return;
        }
        const p = this.scene(opt);
        if (this.hasDoc) $("status-pos").textContent = `${Math.round(p.x)}, ${Math.round(p.y)}`;
        if (this.drag) this.updateDrag(p, e);
        if (this.tool === "pen" && this.pen) this.penMove(p);
    }

    onUp(opt) {
        if (this.pan) { this.pan = null; if (this.tool !== "hand" && !this.space) $("stage").classList.remove("hand"); return; }
        if (this.drag) this.endDrag(this.scene(opt), opt.e);
        if (this.tool === "pen" && this.pen) this.penUp();
    }

    // ---------- snapping ----------
    snapMove(obj) {
        this.guides = [];
        if (!this.snap || !obj) return;
        const t = 8 / this.zoom;
        const r = obj.getBoundingRect();
        const xs = [r.left, r.left + r.width / 2, r.left + r.width], ys = [r.top, r.top + r.height / 2, r.top + r.height];
        const tx = [0, this.W / 2, this.W], ty = [0, this.H / 2, this.H];
        let best = null;
        for (const a of xs) for (const b of tx) if (Math.abs(a - b) < t && (!best || Math.abs(a - b) < Math.abs(best.d))) best = { d: b - a, at: b };
        if (best) { obj.left += best.d; this.guides.push({ x: best.at }); }
        best = null;
        for (const a of ys) for (const b of ty) if (Math.abs(a - b) < t && (!best || Math.abs(a - b) < Math.abs(best.d))) best = { d: b - a, at: b };
        if (best) { obj.top += best.d; this.guides.push({ y: best.at }); }
        obj.setCoords();
    }

    // ---------- tools ----------
    setTool(tool) {
        if (this.pen && tool !== "pen") this.finishPen(false);
        this.tool = tool;
        const cv = this.canvas;
        document.querySelectorAll(".tool").forEach(b => b.classList.toggle("on", b.dataset.tool === tool));
        const names = { select: "Select", hand: "Hand", brush: "Brush", eraser: "Eraser", fill: "Fill bucket", gradient: "Gradient",
            shape: "Shapes", line: "Line", pen: "Pen", text: "Text", eyedropper: "Eyedropper" };
        $("opt-tool-name").textContent = names[tool];
        document.querySelectorAll("#optionsbar .opt").forEach(o => o.classList.toggle("on", o.dataset.for.split(" ").includes(tool)));
        const hints = {
            select: "Click to select, drag to move. Corners keep proportions (Shift stretches); Alt resizes from the centre. Double-click a shape to edit its points.",
            hand: "Drag to move around. Wheel zooms.",
            brush: "Paints into the selected paint layer, or a new one. [ and ] change the size.",
            eraser: "Erases the selected layer (or every layer, in the options).",
            fill: "Click an area to fill it with the main colour, as a new layer.",
            gradient: "Drag across the texture: from the main colour to the second colour. Applies to the selected shape, or makes a new layer.",
            shape: "Drag to draw. Shift keeps proportions. Pick the shape in the options bar.",
            line: "Drag to draw a line. Shift snaps to 45°.",
            pen: "Click to add points, drag to curve them. Click the first point to close, Enter or double-click to finish, Esc to cancel.",
            text: "Click to add text, then type. Curve and spacing are in Properties.",
            eyedropper: "Click to pick a colour from the texture.",
        };
        $("opt-hint").textContent = hints[tool];
        const drawing = tool === "brush" || tool === "eraser";
        cv.isDrawingMode = drawing;
        const interactive = tool === "select";
        cv.selection = interactive;
        cv.skipTargetFind = !interactive;
        cv.defaultCursor = tool === "hand" ? "grab" : interactive ? "default" : "crosshair";
        $("stage").classList.toggle("hand", tool === "hand");
        if (!interactive && tool !== "brush" && tool !== "eraser") cv.discardActiveObject();
        if (drawing) this.setupBrush();
        cv.requestRenderAll();
    }

    setupBrush() {
        const cv = this.canvas, size = +$("opt-size").value;
        if (this.tool === "eraser") {
            const target = $("opt-erase-target").value, sel = this.selected();
            for (const o of this.canvas.getObjects())
                o.erasable = !o.isTemplate && !o.isHelper && (target === "all" || sel.includes(o));
            const b = new EraserBrush(cv);
            b.width = size;
            b.on("end", () => setTimeout(() => this.commit(), 50));
            cv.freeDrawingBrush = b;
            return;
        }
        const kind = $("opt-brush-kind").value;
        const B = kind === "spray" ? fabric.SprayBrush : kind === "circle" ? fabric.CircleBrush : fabric.PencilBrush;
        const b = new B(cv);
        const [r, g, bl] = hexToRgb($("color-fg").value), a = +$("opt-opacity").value / 100;
        b.color = `rgba(${r},${g},${bl},${a})`;
        b.width = size;
        const soft = +$("opt-soft").value / 100;
        if (soft > 0) b.shadow = new fabric.Shadow({ blur: size * soft * 1.2, color: b.color, offsetX: 0, offsetY: 0 });
        if (kind === "pencil") b.decimate = 2;
        cv.freeDrawingBrush = b;
        // where strokes go: the selected paint layer, or a new one made on the first stroke
        const sel = this.selected();
        this.paintTarget = sel.length === 1 && sel[0].layerType === "paint" ? sel[0] : null;
    }

    onPathCreated(path) {
        if (!path || this.tool !== "brush") return;
        const cv = this.canvas;
        cv.remove(path);
        if (!this.hasDoc) { toast("Choose a template first."); return; }
        let target = this.paintTarget && cv.getObjects().includes(this.paintTarget) ? this.paintTarget : null;
        if (!target) {
            target = new fabric.Group([path], { layerType: "paint", name: "Paint", subTargetCheck: false, interactive: false });
            this.paintTarget = target;
            this.addObject(target, { select: false });
        } else {
            target.add(path);
            target.setCoords();
            this.commit();
        }
        cv.requestRenderAll();
    }

    // drag tools: shapes, lines, gradients
    startDrag(p) {
        this.drag = { start: p };
        const fg = $("color-fg").value, sw = +$("opt-stroke-w").value, fillOn = $("opt-fill-on").checked;
        if (this.tool === "shape") {
            const s = SHAPES[this.shape];
            const o = new fabric.Path(s.d, {
                fill: fillOn ? fg : "", stroke: sw || !fillOn ? $("color-bg").value : null, strokeWidth: sw || (fillOn ? 0 : 4),
                strokeUniform: true, fillRule: "evenodd", left: p.x, top: p.y, scaleX: 0.01, scaleY: 0.01,
                fillKind: "solid", fill1: fg, fill2: $("color-bg").value, name: s.name,
            });
            this.drag.obj = o;
            this.canvas.add(o);
        } else if (this.tool === "line") {
            const o = new fabric.Line([p.x, p.y, p.x, p.y], { stroke: fg, strokeWidth: Math.max(sw, 6), strokeLineCap: "round", name: "Line" });
            this.drag.obj = o;
            this.canvas.add(o);
        } else {
            this.drag.line = new fabric.Line([p.x, p.y, p.x, p.y], { stroke: "#ffffff", strokeWidth: 2 / this.zoom,
                strokeDashArray: [6 / this.zoom, 4 / this.zoom], evented: false, selectable: false });
            this.drag.line.isHelper = true;
            this.canvas.add(this.drag.line);
        }
    }

    updateDrag(p, e) {
        const d = this.drag, s = d.start, o = d.obj;
        let dx = p.x - s.x, dy = p.y - s.y;
        if (this.tool === "shape") {
            if (e.shiftKey) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
            o.set({ left: s.x + dx / 2, top: s.y + dy / 2, scaleX: Math.max(Math.abs(dx), 1) / o.width, scaleY: Math.max(Math.abs(dy), 1) / o.height });
        } else if (this.tool === "line") {
            if (e.shiftKey) {
                const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, len = Math.hypot(dx, dy);
                dx = Math.cos(a) * len; dy = Math.sin(a) * len;
            }
            o.set({ x2: s.x + dx, y2: s.y + dy });
        } else d.line.set({ x2: p.x, y2: p.y });
        (o || d.line).setCoords();
        this.canvas.requestRenderAll();
    }

    endDrag(p, e) {
        const d = this.drag; this.drag = null;
        const tiny = Math.hypot(p.x - d.start.x, p.y - d.start.y) < 3 / this.zoom;
        if (this.tool === "gradient") {
            this.canvas.remove(d.line);
            if (!tiny) this.applyGradientDrag(d.start, p);
            return;
        }
        const o = d.obj;
        this.canvas.remove(o);
        if (this.tool === "shape" && tiny) {          // a click: a 300 px shape
            o.set({ left: p.x, top: p.y, scaleX: 300 / o.width, scaleY: 300 / o.height });
        }
        if (this.tool === "line" && tiny) return;
        o.setCoords();
        this.addObject(o);
        this.setTool("select");
    }

    applyGradientDrag(a, b) {
        const c1 = $("color-fg").value, c2 = $("color-bg").value, radial = $("opt-grad-type").value === "radial";
        const sel = this.selected().filter(o => !o.isTemplate);
        const stops = [{ offset: 0, color: c1 }, { offset: 1, color: c2 }];
        if (sel.length === 1 && sel[0].type !== "image" && sel[0].layerType !== "paint") {
            // the selected shape: angle from the drag
            const o = sel[0];
            o.set({ fillKind: radial ? "radial" : "linear", fill1: c1, fill2: c2, gradMid: 50,
                gradAngle: Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 360) % 360) });
            this.applyFill(o);
            this.syncMirror(o, true);
            this.commit(); this.updateProps();
            return;
        }
        // a new layer covering the texture, the gradient exactly where it was dragged
        const r = new fabric.Rect({ left: this.W / 2, top: this.H / 2, width: this.W, height: this.H, name: "Gradient", fillKind: "custom" });
        r.set("fill", new fabric.Gradient(radial
            ? { type: "radial", gradientUnits: "pixels", coords: { x1: a.x, y1: a.y, r1: 0, x2: a.x, y2: a.y, r2: Math.hypot(b.x - a.x, b.y - a.y) }, colorStops: stops }
            : { type: "linear", gradientUnits: "pixels", coords: { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, colorStops: stops }));
        this.addObject(r);
    }

    // the Fill settings of a shape / text: solid, linear or radial gradient (angle + balance), or none
    applyFill(o) {
        const k = o.fillKind || "solid", c1 = o.fill1 || toHex(o.fill), c2 = o.fill2 || "#000000";
        if (k === "none") return o.set("fill", "");
        if (k === "solid") return o.set("fill", c1);
        if (k === "custom") return;
        const mid = (o.gradMid ?? 50) / 100;
        const stops = [{ offset: 0, color: c1 }, { offset: mid, color: mix(c1, c2, 0.5) }, { offset: 1, color: c2 }];
        if (k === "radial") {
            o.set("fill", new fabric.Gradient({ type: "radial", gradientUnits: "percentage",
                coords: { x1: .5, y1: .5, r1: 0, x2: .5, y2: .5, r2: .5 }, colorStops: stops }));
        } else {
            const a = (o.gradAngle ?? 90) * Math.PI / 180, cx = Math.cos(a) / 2, cy = Math.sin(a) / 2;
            o.set("fill", new fabric.Gradient({ type: "linear", gradientUnits: "percentage",
                coords: { x1: .5 - cx, y1: .5 - cy, x2: .5 + cx, y2: .5 + cy }, colorStops: stops }));
        }
    }

    // text
    textDown(p) {
        const hit = [...this.canvas.getObjects()].reverse().find(o => o.isType?.("IText") && o.visible && o.containsPoint(p));
        if (hit) {
            this.setTool("select");
            this.canvas.setActiveObject(hit);
            hit.enterEditing();
            return;
        }
        const t = new fabric.IText("TEXT", {
            left: p.x, top: p.y, fontFamily: $("opt-font").value, fontSize: +$("opt-font-size").value,
            fill: $("color-fg").value, fillKind: "solid", fill1: $("color-fg").value, fill2: $("color-bg").value,
            textCurve: 0, name: "Text", strokeUniform: true, paintFirst: "stroke",
        });
        this.setTool("select");
        this.addObject(t);
        loadFont(t.fontFamily).then(() => { t.initDimensions(); this.canvas.requestRenderAll(); });
        t.enterEditing();
        t.selectAll();
    }

    // curved text: the text runs along an arc as long as the text, bending up (+) or down (-)
    applyCurve(t) {
        if (!t || !t.isType?.("IText")) return;
        const c = t.textCurve || 0;
        const center = t.getCenterPoint();
        if (!c) {
            if (t.path) { t.set({ path: undefined }); t.initDimensions(); t.setPositionByOrigin(center, "center", "center"); }
            return;
        }
        t.set({ path: undefined });
        t.initDimensions();
        const L = t.calcTextWidth();
        const phi = Math.abs(c) / 100 * Math.PI * 1.5;
        const r = L / phi;
        const up = c > 0;
        const a0 = up ? -Math.PI / 2 - phi / 2 : Math.PI / 2 + phi / 2;
        const a1 = up ? -Math.PI / 2 + phi / 2 : Math.PI / 2 - phi / 2;
        const P = a => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
        const d = `M ${P(a0)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${phi > Math.PI ? 1 : 0} ${up ? 1 : 0} ${P(a1)}`;
        t.set({ path: new fabric.Path(d, { visible: false }), pathAlign: "baseline", pathStartOffset: 0, textAlign: "left" });
        t.initDimensions();
        t.setPositionByOrigin(center, "center", "center");
        t.setCoords();
        this.canvas.requestRenderAll();
    }

    // pen: clicks add points, a drag pulls out curve handles
    penDown(p) {
        if (!this.pen) this.pen = { pts: [], preview: null };
        const pts = this.pen.pts;
        if (pts.length >= 2 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < 10 / this.zoom) { this.finishPen(true); return; }
        pts.push({ x: p.x, y: p.y, out: null });
        this.pen.dragging = true;
        this.penPreview();
    }

    penMove(p) {
        const pen = this.pen, last = pen.pts[pen.pts.length - 1];
        if (pen.dragging && last && Math.hypot(p.x - last.x, p.y - last.y) > 3 / this.zoom) last.out = { x: p.x, y: p.y };
        pen.cursor = p;
        this.penPreview();
    }

    penUp() { if (this.pen) this.pen.dragging = false; }

    penPath(pts, closed, cursor) {
        const cIn = q => q.out ? { x: 2 * q.x - q.out.x, y: 2 * q.y - q.out.y } : q;
        let d = `M ${pts[0].x} ${pts[0].y}`;
        const seg = (a, b) => { const o = a.out || a, i = cIn(b); d += ` C ${o.x} ${o.y} ${i.x} ${i.y} ${b.x} ${b.y}`; };
        for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i]);
        if (cursor) seg(pts[pts.length - 1], cursor);
        if (closed) { seg(pts[pts.length - 1], pts[0]); d += " Z"; }
        return d;
    }

    penPreview() {
        const pen = this.pen;
        if (pen.preview) this.canvas.remove(pen.preview);
        pen.preview = null;
        if (!pen.pts.length) return;
        const d = this.penPath(pen.pts, false, pen.dragging ? null : pen.cursor);
        pen.preview = new fabric.Path(d, { fill: "", stroke: "#f97316", strokeWidth: 2 / this.zoom, evented: false, selectable: false });
        pen.preview.isHelper = true;
        this.canvas.add(pen.preview);
        this.canvas.requestRenderAll();
    }

    drawPenHandles(ctx, v) {
        const T = q => [q.x * v[0] + v[4], q.y * v[3] + v[5]];
        for (const q of this.pen.pts) {
            const [x, y] = T(q);
            if (q.out) {
                const [ox, oy] = T(q.out), [ix, iy] = T({ x: 2 * q.x - q.out.x, y: 2 * q.y - q.out.y });
                ctx.strokeStyle = "#fb923c"; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ox, oy); ctx.stroke();
                ctx.fillStyle = "#fb923c"; for (const [hx, hy] of [[ox, oy], [ix, iy]]) { ctx.beginPath(); ctx.arc(hx, hy, 3, 0, 7); ctx.fill(); }
            }
            ctx.fillStyle = "#fff"; ctx.strokeStyle = "#f97316"; ctx.setLineDash([]);
            ctx.fillRect(x - 4, y - 4, 8, 8); ctx.strokeRect(x - 4, y - 4, 8, 8);
        }
    }

    finishPen(closed) {
        const pen = this.pen; this.pen = null;
        if (!pen) return;
        if (pen.preview) this.canvas.remove(pen.preview);
        if (pen.pts.length < 2) { this.canvas.requestRenderAll(); return; }
        const fg = $("color-fg").value, sw = +$("opt-stroke-w").value, fillOn = $("opt-fill-on").checked && closed;
        const o = new fabric.Path(this.penPath(pen.pts, closed), {
            fill: fillOn ? fg : "", stroke: fillOn ? (sw ? $("color-bg").value : null) : fg,
            strokeWidth: fillOn ? sw : Math.max(sw, 6), strokeUniform: true, strokeLineCap: "round", strokeLineJoin: "round",
            fillKind: fillOn ? "solid" : "none", fill1: fg, fill2: $("color-bg").value, name: closed ? "Path" : "Stroke",
        });
        this.addObject(o);
        this.setTool("select");
    }

    // point editing for paths (pen paths and shapes)
    toggleEditPoints(o, on = !o.isEditingPoints) {
        if (!o || o.type !== "path") return;
        o.isEditingPoints = on;
        if (on) {
            o.controls = fabric.controlsUtils.createPathControls(o, {
                controlPointStyle: { controlStroke: "#fb923c", controlFill: "#fb923c" },
                pointStyle: { controlStroke: "#f97316", controlFill: "#ffffff" },
            });
            o.hasBorders = false;
            o.setCoords();                       // positions for the new handles
            toast("Editing points: drag them, Enter or Esc when done.");
        } else {
            o.controls = fabric.controlsUtils.createObjectDefaultControls();
            o.hasBorders = true;
            o.setCoords();
            this.commit();
        }
        this.canvas.requestRenderAll();
        $("p-edit-points").classList.toggle("on", on);
    }

    // pixel tools
    sample(p) {
        const tplOnly = $("opt-sample").value === "template";
        const c = this.renderDoc({ template: true, only: tplOnly ? o => o.isTemplate : null });
        return { c, x: Math.floor(p.x), y: Math.floor(p.y) };
    }

    eyedrop(p) {
        if (p.x < 0 || p.y < 0 || p.x >= this.W || p.y >= this.H) return;
        const { c, x, y } = this.sample(p);
        const d = c.getContext("2d").getImageData(x, y, 1, 1).data;
        if (d[3] === 0) { toast("Nothing there (transparent)."); return; }
        const hex = "#" + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, "0")).join("");
        $("color-fg").value = hex;
        $("color-fg").dispatchEvent(new Event("input"));
        toast("Picked " + hex);
    }

    async bucket(p) {
        if (p.x < 0 || p.y < 0 || p.x >= this.W || p.y >= this.H) return;
        $("status-hint").textContent = "Filling…";
        await new Promise(r => setTimeout(r, 10));
        const { c, x, y } = this.sample(p);
        const W = c.width, H = c.height;
        const src = c.getContext("2d").getImageData(0, 0, W, H).data;
        const tol = +$("opt-tolerance").value;
        const i0 = (y * W + x) * 4, r0 = src[i0], g0 = src[i0 + 1], b0 = src[i0 + 2], a0 = src[i0 + 3];
        const mask = new Uint8Array(W * H);
        const stack = new Int32Array(W * H);
        let sp = 0, minX = x, maxX = x, minY = y, maxY = y;
        const ok = i => { const k = i * 4;
            return Math.abs(src[k] - r0) <= tol && Math.abs(src[k + 1] - g0) <= tol && Math.abs(src[k + 2] - b0) <= tol && Math.abs(src[k + 3] - a0) <= tol; };
        stack[sp++] = y * W + x; mask[y * W + x] = 1;
        while (sp) {
            const i = stack[--sp], px = i % W, py = (i / W) | 0;
            if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
            const n = [px > 0 ? i - 1 : -1, px < W - 1 ? i + 1 : -1, py > 0 ? i - W : -1, py < H - 1 ? i + W : -1];
            for (const j of n) if (j >= 0 && !mask[j] && ok(j)) { mask[j] = 1; stack[sp++] = j; }
        }
        const w = maxX - minX + 1, h = maxY - minY + 1;
        // one pixel wider, so the fill tucks under anti-aliased template lines
        const out = document.createElement("canvas"); out.width = w + 2; out.height = h + 2;
        const octx = out.getContext("2d"), img = octx.createImageData(w + 2, h + 2);
        const [R, G, B] = hexToRgb($("color-fg").value);
        for (let yy = -1; yy <= h; yy++) for (let xx = -1; xx <= w; xx++) {
            const X = minX + xx, Y = minY + yy;
            let hit = X >= 0 && Y >= 0 && X < W && Y < H && mask[Y * W + X];
            if (!hit) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const X2 = X + ox, Y2 = Y + oy;
                if (X2 >= 0 && Y2 >= 0 && X2 < W && Y2 < H && mask[Y2 * W + X2]) { hit = true; break; }
            }
            if (hit) { const k = ((yy + 1) * (w + 2) + (xx + 1)) * 4; img.data[k] = R; img.data[k + 1] = G; img.data[k + 2] = B; img.data[k + 3] = 255; }
        }
        octx.putImageData(img, 0, 0);
        const fi = await fabric.FabricImage.fromURL(out.toDataURL("image/png"));
        fi.set({ left: minX - 1 + (w + 2) / 2, top: minY - 1 + (h + 2) / 2, name: "Fill", adjust: { tintColor: $("color-fg").value } });
        this.addObject(fi, { select: false });
        $("status-hint").textContent = `Filled ${w} × ${h} px.`;
    }

    // ---------- images ----------
    async imageFromFile(file) {
        if (/\.dds$/i.test(file.name)) {
            const d = DDSDecoder.decode(await file.arrayBuffer());
            const c = document.createElement("canvas"); c.width = d.width; c.height = d.height;
            c.getContext("2d").putImageData(new ImageData(d.data, d.width, d.height), 0, 0);
            return c;
        }
        const url = URL.createObjectURL(file);
        const img = new Image(); img.src = url;
        await img.decode();
        return img;
    }

    async importImage(file) {
        if (!this.hasDoc) { await this.useAsTemplate(file); return; }
        const el = await this.imageFromFile(file);
        const src = el instanceof HTMLCanvasElement ? el.toDataURL("image/png") : await blobToDataURL(file);
        const img = await fabric.FabricImage.fromURL(src);
        const s = Math.min(1, this.W * 0.6 / img.width, this.H * 0.6 / img.height);
        img.set({ left: this.W / 2, top: this.H / 2, scaleX: s, scaleY: s, name: file.name.replace(/\.[^.]+$/, "") });
        this.setTool("select");
        this.addObject(img);
    }

    async useAsTemplate(file) {
        const el = await this.imageFromFile(file);
        this.vehicle = null;
        await this.setTemplate(el, { name: file.name });
    }

    // ---------- commands ----------
    async run(cmd) {
        const cv = this.canvas, sel = this.selected().filter(o => !o.isTemplate);
        const one = sel.length === 1 ? sel[0] : null;
        switch (cmd) {
            case "template": openTemplateDialog(this); break;
            case "openGame": openTemplateDialog(this, "game"); break;
            case "importImage": $("file-image").click(); break;
            case "customBase": $("file-base").click(); break;
            case "openProject": $("file-project").click(); break;
            case "saveProject": {
                if (!this.hasDoc) return;
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([this.projectJSON()], { type: "application/json" }));
                a.download = ($("exp-name").value || "livery") + ".livery.json"; a.click();
                toast("Project saved. Open it again with File › Open project.");
                break;
            }
            case "export": if (this.hasDoc) openExport(this); else toast("Choose a template first.", true); break;
            case "undo": this.undo(); break;
            case "redo": this.redo(); break;
            case "selectAll": {
                this.setTool("select");
                const objs = this.layerObjects().filter(o => o.selectable && o.visible);
                if (!objs.length) return;
                cv.setActiveObject(objs.length === 1 ? objs[0] : new fabric.ActiveSelection(objs, { canvas: cv }));
                cv.requestRenderAll();
                break;
            }
            case "delete":
                if (!sel.length) return;
                cv.discardActiveObject();
                sel.forEach(o => { cv.remove(o); this.removeMirrorLink(o); });
                this.commit();
                break;
            case "copy": case "cut":
                if (!sel.length) return;
                this.clipboard = await Promise.all(sel.map(o => this.cloneObj(o)));
                if (cmd === "cut") this.run("delete");
                break;
            case "paste": {
                if (!this.clipboard) return;
                const copies = await Promise.all(this.clipboard.map(o => this.cloneObj(o)));
                cv.discardActiveObject();
                copies.forEach(o => { o.set({ left: o.left + 24, top: o.top + 24, uid: uid(), mirrorOf: undefined, mirrorAxis: undefined }); this.addObject(o, { select: false }); });
                this.clipboard = await Promise.all(copies.map(o => this.cloneObj(o)));
                cv.setActiveObject(copies.length === 1 ? copies[0] : new fabric.ActiveSelection(copies, { canvas: cv }));
                cv.requestRenderAll();
                break;
            }
            case "duplicate": {
                if (!sel.length) return;
                const copies = await Promise.all(sel.map(o => this.cloneObj(o)));
                cv.discardActiveObject();
                copies.forEach((o, i) => { o.set({ left: o.left + 24, top: o.top + 24, uid: uid(), mirrorOf: undefined, mirrorAxis: undefined, name: sel[i].name + " copy" }); this.addObject(o, { select: false }); });
                cv.setActiveObject(copies.length === 1 ? copies[0] : new fabric.ActiveSelection(copies, { canvas: cv }));
                cv.requestRenderAll();
                break;
            }
            case "group": {
                if (sel.length < 2) return;
                const objs = this.layerObjects().filter(o => sel.includes(o));      // keep their stacking order
                const idx = cv.getObjects().indexOf(objs[objs.length - 1]) - objs.length + 1;
                cv.discardActiveObject();
                objs.forEach(o => cv.remove(o));
                const g = new fabric.Group(objs, { name: "Group", uid: uid() });
                cv.insertAt(Math.max(0, idx), g);
                cv.setActiveObject(g);
                this.commit();
                break;
            }
            case "ungroup": {
                if (!one || one.type !== "group") return;
                const idx = cv.getObjects().indexOf(one);
                cv.discardActiveObject();
                cv.remove(one);
                const kids = one.removeAll();
                kids.forEach((k, i) => { k.uid = k.uid || uid(); cv.insertAt(idx + i, k); k.setCoords(); });
                cv.setActiveObject(new fabric.ActiveSelection(kids, { canvas: cv }));
                cv.requestRenderAll();
                this.commit();
                break;
            }
            case "front": sel.forEach(o => cv.bringObjectToFront(o)); if (this.overlay) this.applyOverlay(); this.commit(); break;
            case "back": sel.reverse().forEach(o => { cv.sendObjectToBack(o); }); if (!this.overlay && this.template) cv.sendObjectToBack(this.template); this.commit(); break;
            case "forward": sel.forEach(o => cv.bringObjectForward(o)); if (this.overlay) this.applyOverlay(); this.commit(); break;
            case "backward": sel.forEach(o => { const i = cv.getObjects().indexOf(o); if (i > (this.overlay ? 0 : 1)) cv.sendObjectBackwards(o); }); this.commit(); break;
            case "flipH": case "flipV":
                sel.forEach(o => { o.set(cmd === "flipH" ? "flipX" : "flipY", !o[cmd === "flipH" ? "flipX" : "flipY"]); this.syncMirror(o, true); });
                cv.requestRenderAll(); this.commit(); break;
            case "mirrorH": case "mirrorV": if (one) await this.makeMirror(one, cmd === "mirrorH" ? "h" : "v"); break;
            case "lock": sel.forEach(o => this.setLocked(o, !o.locked)); cv.discardActiveObject(); cv.requestRenderAll(); this.commit(); break;
            case "rasterize": if (one) await this.rasterize(one); break;
            case "editPoints": if (one) this.toggleEditPoints(one); break;
            case "newPaint": {
                this.setTool("brush");
                this.paintTarget = null;
                toast("Paint away: the first stroke starts a new paint layer.");
                break;
            }
            case "alignL": case "alignCX": case "alignR": case "alignT": case "alignCY": case "alignB": {
                const a = cv.getActiveObject();
                if (!a) return;
                const r = a.getBoundingRect();
                const d = { alignL: [-r.left, 0], alignCX: [this.W / 2 - (r.left + r.width / 2), 0], alignR: [this.W - (r.left + r.width), 0],
                    alignT: [0, -r.top], alignCY: [0, this.H / 2 - (r.top + r.height / 2)], alignB: [0, this.H - (r.top + r.height)] }[cmd];
                a.set({ left: a.left + d[0], top: a.top + d[1] }); a.setCoords();
                if (!a.isType("ActiveSelection")) this.syncMirror(a);
                cv.requestRenderAll(); this.commit(); this.updateProps();
                break;
            }
            case "fit": this.fit(); break;
            case "actual": this.zoomTo(1); break;
            case "zoomIn": this.zoomTo(this.zoom * 1.25); break;
            case "zoomOut": this.zoomTo(this.zoom / 1.25); break;
            case "toggleOverlay": this.overlay = !this.overlay; this.applyOverlay(); this.refreshLayers(); this.autosave(); break;
            case "toggleSnap": this.snap = !this.snap; $("menu-snap").classList.toggle("on", this.snap); break;
            case "help": $("dlg-help").showModal(); break;
        }
    }

    setLocked(o, locked) {
        o.locked = locked;
        o.set({ selectable: !locked, evented: !locked });
    }

    async rasterize(o) {
        const center = o.getCenterPoint();
        const el = o.toCanvasElement({ multiplier: 1 });
        const img = await fabric.FabricImage.fromURL(el.toDataURL("image/png"));
        img.set({ left: center.x, top: center.y, name: (o.name || "Layer") + " (tattoo)", opacity: o.opacity,
            globalCompositeOperation: o.globalCompositeOperation, uid: uid() });
        const idx = this.canvas.getObjects().indexOf(o);
        this.canvas.remove(o);
        this.removeMirrorLink(o);
        this.canvas.insertAt(idx, img);
        this.canvas.setActiveObject(img);
        this.commit();
        toast("Rasterized: it's now a picture you can recolour (Tint) and transform.");
    }

    // ---------- linked mirrors ----------
    partner(o) { return o && o.mirrorOf ? this.canvas.getObjects().find(x => x.uid === o.mirrorOf) : null; }

    removeMirrorLink(o) {
        const p = this.partner(o);
        if (p) { p.mirrorOf = undefined; p.mirrorAxis = undefined; }
    }

    async makeMirror(o, axis) {
        if (this.partner(o)) { toast("This layer already has a linked mirror.", true); return; }
        const m = await o.clone();
        m.set({ uid: uid(), name: (o.name || "Layer") + " (mirror)", mirrorOf: o.uid, mirrorAxis: axis });
        o.set({ mirrorOf: m.uid, mirrorAxis: axis });
        this.placeMirror(o, m);
        const idx = this.canvas.getObjects().indexOf(o);
        this.canvas.insertAt(idx + 1, m);
        this.canvas.requestRenderAll();
        this.commit();
        toast("Linked mirror made: move, resize or restyle either one and the other follows.");
    }

    placeMirror(src, m) {
        const h = src.mirrorAxis === "h";
        m.set({
            left: h ? this.W - src.left : src.left, top: h ? src.top : this.H - src.top,
            angle: -src.angle, scaleX: src.scaleX, scaleY: src.scaleY, skewX: -src.skewX, skewY: -src.skewY,
            flipX: h ? !src.flipX : src.flipX, flipY: h ? src.flipY : !src.flipY,
        });
        m.setCoords();
    }

    async syncMirror(src, content = false) {
        const m = this.partner(src);
        if (!m || this.restoring) return;
        if (!content) { this.placeMirror(src, m); this.canvas.requestRenderAll(); return; }
        // restyled (colour, text, filters...): replace the copy, keeping its id and place in the stack
        if (this.syncing) return;
        this.syncing = true;
        const c = await src.clone();
        c.set({ uid: m.uid, name: m.name, mirrorOf: src.uid, mirrorAxis: src.mirrorAxis, visible: m.visible });
        this.placeMirror(src, c);
        const idx = this.canvas.getObjects().indexOf(m);
        if (idx >= 0) { this.canvas.remove(m); this.canvas.insertAt(idx, c); }
        this.syncing = false;
        this.canvas.requestRenderAll();
    }

    // ---------- context menu ----------
    onContextMenu(e) {
        e.preventDefault();
        if (!this.hasDoc) return;
        const p = this.canvas.getScenePoint(e);
        const target = [...this.canvas.getObjects()].reverse()
            .find(o => !o.isTemplate && !o.isHelper && o.visible && o.selectable && o.containsPoint(p));
        if (target && !target.isTemplate && !this.selected().includes(target)) {
            this.setTool("select");
            this.canvas.setActiveObject(target);
            this.canvas.requestRenderAll();
        }
        const m = $("ctxmenu");
        m.hidden = false;
        const r = m.getBoundingClientRect();
        m.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + "px";
        m.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + "px";
    }
    hideContext() { $("ctxmenu").hidden = true; }

    // ---------- layers panel ----------
    refreshLayers = debounce((thumbs = true) => this._refreshLayers(thumbs), 60);

    _refreshLayers(thumbs) {
        const ul = $("layers"), sel = this.selected();
        const objs = this.canvas.getObjects().filter(o => !o.isHelper).reverse();
        this.thumbs = this.thumbs || new Map();
        ul.innerHTML = "";
        const eye = '<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
        const lock = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
        for (const o of objs) {
            const li = document.createElement("li");
            li.classList.toggle("sel", sel.includes(o));
            li.classList.toggle("dim", !o.visible);
            li.draggable = !o.isTemplate;
            const kind = o.isTemplate ? (this.overlay ? "template · on top" : "template")
                : o.layerType === "paint" ? "paint" : o.isType("IText") ? "text" : o.type === "image" ? "picture"
                : o.type === "group" ? `group · ${o.size()}` : o.type === "line" ? "line" : "shape";
            const link = o.mirrorOf ? " · 🔗 mirror" : "";
            li.innerHTML = `<img class="thumb" alt=""><div class="name"><span></span><small>${kind}${link}</small></div>
                <button class="vis ${o.visible ? "" : "off"}" title="Show / hide">${eye}</button>
                ${o.isTemplate ? "" : `<button class="lk ${o.locked ? "" : "off"}" title="Lock">${lock}</button>`}`;
            li.querySelector(".name span").textContent = o.name || "Layer";
            const img = li.querySelector("img");
            const key = o.uid;
            if (thumbs || !this.thumbs.has(key)) {
                try {
                    const max = Math.max(o.getScaledWidth(), o.getScaledHeight(), 1);
                    this.thumbs.set(key, o.toDataURL({ multiplier: Math.min(1, 68 / max), format: "png" }));
                } catch { /* empty groups etc. */ }
            }
            if (this.thumbs.get(key)) img.src = this.thumbs.get(key);
            li.querySelector(".vis").onclick = ev => { ev.stopPropagation(); o.visible = !o.visible; if (!o.visible && sel.includes(o)) this.canvas.discardActiveObject(); this.canvas.requestRenderAll(); this.commit(); this.refreshLayers(false); };
            const lk = li.querySelector(".lk");
            if (lk) lk.onclick = ev => { ev.stopPropagation(); this.setLocked(o, !o.locked); if (o.locked) this.canvas.discardActiveObject(); this.canvas.requestRenderAll(); this.commit(); };
            li.onclick = ev => {
                if (o.isTemplate || o.locked || !o.visible) return;
                this.setTool("select");
                if (ev.shiftKey || ev.ctrlKey) {
                    const cur = this.selected().filter(x => x !== o);
                    const list = sel.includes(o) ? cur : [...cur, o];
                    this.canvas.discardActiveObject();
                    if (list.length) this.canvas.setActiveObject(list.length === 1 ? list[0] : new fabric.ActiveSelection(list, { canvas: this.canvas }));
                } else this.canvas.setActiveObject(o);
                this.canvas.requestRenderAll();
            };
            li.querySelector(".name").ondblclick = () => {
                if (o.isTemplate) return;
                const span = li.querySelector(".name span"), input = document.createElement("input");
                input.value = o.name || ""; span.replaceWith(input); input.focus(); input.select();
                const done = () => { o.name = input.value.trim() || o.name; this.commit(); this.refreshLayers(false); };
                input.onblur = done; input.onkeydown = e => { if (e.key === "Enter") input.blur(); if (e.key === "Escape") { input.value = o.name; input.blur(); } };
            };
            // drag to reorder
            li.ondragstart = e => { this.dragLayer = o; e.dataTransfer.effectAllowed = "move"; };
            li.ondragover = e => { if (!this.dragLayer) return; e.preventDefault(); const r = li.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
                li.classList.toggle("drop-above", above); li.classList.toggle("drop-below", !above); };
            li.ondragleave = () => li.classList.remove("drop-above", "drop-below");
            li.ondrop = e => {
                e.preventDefault();
                const src = this.dragLayer; this.dragLayer = null;
                if (!src || src === o) return this.refreshLayers(false);
                const r = li.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
                const all = this.canvas.getObjects();
                let idx = all.indexOf(o) + (above ? 1 : 0);
                if (all.indexOf(src) < idx) idx--;
                this.canvas.moveObjectTo(src, idx);
                if (this.template) this.applyOverlay();
                this.commit();
            };
            ul.appendChild(li);
            if (o.isTemplate) {
                const ex = document.createElement("div");
                ex.className = "tpl-extra";
                ex.innerHTML = `Opacity <input type="range" min="5" max="100" value="${Math.round(o.opacity * 100)}"><label><input type="checkbox" ${this.overlay ? "checked" : ""}> on top</label>`;
                ex.querySelector("input[type=range]").oninput = e => { o.opacity = e.target.value / 100; this.canvas.requestRenderAll(); };
                ex.querySelector("input[type=range]").onchange = () => this.autosave();
                ex.querySelector("input[type=checkbox]").onchange = () => this.run("toggleOverlay");
                ul.appendChild(ex);
            }
        }
        if (!objs.length) ul.innerHTML = `<li class="muted small" style="cursor:default">No layers yet.</li>`;
    }

    // ---------- properties panel ----------
    updatePropsLive = (() => { let raf = 0; return () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => this.fillTransform()); }; })();

    updateProps() {
        const sel = this.selected().filter(o => !o.isTemplate);
        const o = sel.length === 1 ? sel[0] : null;
        $("props-body").hidden = !sel.length;
        $("props-empty").hidden = !!sel.length;
        if (!sel.length) { $("props-kind").textContent = ""; return; }
        $("props-kind").textContent = sel.length > 1 ? `${sel.length} layers` : (o.name || "");
        this.fillTransform();
        const isText = o && o.isType("IText"), isImg = o && o.type === "image", isPaint = o && o.layerType === "paint";
        const vector = o && !isImg && !isPaint && o.type !== "group";
        $("p-fill-box").hidden = !vector;
        $("p-text-box").hidden = !isText;
        $("p-image-box").hidden = !isImg;
        $("p-edit-points").hidden = !(o && o.type === "path");
        $("p-edit-points").classList.toggle("on", !!o?.isEditingPoints);
        $("p-blend").value = (o || sel[0]).globalCompositeOperation || "source-over";
        if (vector) {
            const k = o.fillKind || (typeof o.fill === "string" ? (o.fill ? "solid" : "none") : "custom");
            if (k === "custom") $("p-fill-kind").value = "linear"; else $("p-fill-kind").value = k;
            $("p-fill").value = o.fill1 || toHex(typeof o.fill === "string" && o.fill ? o.fill : (o.fill?.colorStops?.[0]?.color || "#ffffff"));
            $("p-fill2").value = o.fill2 || toHex(o.fill?.colorStops?.[o.fill.colorStops.length - 1]?.color || "#000000");
            const grad = k === "linear" || k === "radial" || k === "custom";
            $("p-fill2").hidden = !grad;
            $("p-grad-row").hidden = !(k === "linear");
            $("p-grad-angle").value = o.gradAngle ?? 90;
            $("p-grad-mid").value = o.gradMid ?? 50;
            $("p-stroke").value = toHex(o.stroke || "#000000");
            $("p-stroke-w").value = o.stroke ? o.strokeWidth : 0;
        }
        if (isText) {
            $("p-text").value = o.text;
            $("p-font").value = o.fontFamily;
            $("p-font-size").value = Math.round(o.fontSize);
            $("p-bold").classList.toggle("on", o.fontWeight === "bold" || o.fontWeight >= 600);
            $("p-italic").classList.toggle("on", o.fontStyle === "italic");
            $("p-spacing").value = o.charSpacing || 0;
            $("p-curve").value = o.textCurve || 0;
        }
        if (isImg) {
            const a = o.adjust || {};
            $("p-hue").value = a.hue || 0; $("p-sat").value = a.sat || 0; $("p-bright").value = a.bright || 0;
            $("p-tint").value = a.tintColor || "#ffffff"; $("p-tint-a").value = a.tint || 0;
        }
    }

    fillTransform() {
        const a = this.canvas.getActiveObject();
        if (!a) return;
        const r = a.getBoundingRect();
        const set = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
        set("p-x", Math.round(r.left)); set("p-y", Math.round(r.top));
        set("p-w", Math.round(a.getScaledWidth())); set("p-h", Math.round(a.getScaledHeight()));
        set("p-angle", Math.round(a.angle || 0)); set("p-opacity", Math.round((a.opacity ?? 1) * 100));
    }

    bindProps() {
        const act = () => this.canvas.getActiveObject();
        const one = () => { const s = this.selected(); return s.length === 1 ? s[0] : null; };
        const done = (o, content = false) => { if (o) { o.setCoords(); this.syncMirror(o, content); } this.canvas.requestRenderAll(); this.commitSoon(); };
        const num = (id, fn) => $(id).addEventListener("change", e => { const a = act(); if (a && e.target.value !== "") { fn(a, +e.target.value); done(a.isType("ActiveSelection") ? null : a); this.fillTransform(); } });
        num("p-x", (a, v) => { a.set("left", a.left + v - a.getBoundingRect().left); });
        num("p-y", (a, v) => { a.set("top", a.top + v - a.getBoundingRect().top); });
        num("p-w", (a, v) => { if (v > 0) a.set("scaleX", v / a.width * Math.sign(a.scaleX || 1)); });
        num("p-h", (a, v) => { if (v > 0) a.set("scaleY", v / a.height * Math.sign(a.scaleY || 1)); });
        num("p-angle", (a, v) => a.rotate(v));
        num("p-opacity", (a, v) => a.set("opacity", clamp(v, 0, 100) / 100));
        $("p-blend").onchange = e => { this.selected().forEach(o => { o.set("globalCompositeOperation", e.target.value); this.syncMirror(o, true); }); this.canvas.requestRenderAll(); this.commit(); };

        const fill = (content = true) => { const o = one(); if (!o) return;
            o.set({ fillKind: $("p-fill-kind").value, fill1: $("p-fill").value, fill2: $("p-fill2").value,
                gradAngle: +$("p-grad-angle").value, gradMid: +$("p-grad-mid").value });
            this.applyFill(o); done(o, content); this.updateProps(); };
        $("p-fill-kind").onchange = () => fill();
        for (const id of ["p-fill", "p-fill2"]) { $(id).oninput = () => fill(false); $(id).onchange = () => fill(); }
        for (const id of ["p-grad-angle", "p-grad-mid"]) { $(id).oninput = () => fill(false); $(id).onchange = () => fill(); }
        const stroke = content => { const o = one(); if (!o) return; const w = +$("p-stroke-w").value;
            o.set({ stroke: w > 0 ? $("p-stroke").value : null, strokeWidth: w, strokeUniform: true, paintFirst: o.isType("IText") ? "stroke" : "fill" });
            done(o, content); };
        $("p-stroke").oninput = () => stroke(false); $("p-stroke").onchange = () => stroke(true); $("p-stroke-w").onchange = () => stroke(true);

        const text = (fn, content = true) => { const o = one(); if (!o || !o.isType("IText")) return; fn(o); o.initDimensions(); this.applyCurve(o); done(o, content); };
        $("p-text").oninput = e => text(o => o.set("text", e.target.value || " "), false);
        $("p-text").onchange = () => text(() => {});
        $("p-font").onchange = async e => { await loadFont(e.target.value); text(o => o.set("fontFamily", e.target.value)); };
        $("p-font-size").onchange = e => text(o => o.set("fontSize", +e.target.value));
        $("p-bold").onclick = () => { text(o => o.set("fontWeight", o.fontWeight === "bold" ? "normal" : "bold")); this.updateProps(); };
        $("p-italic").onclick = () => { text(o => o.set("fontStyle", o.fontStyle === "italic" ? "normal" : "italic")); this.updateProps(); };
        for (const [id, al] of [["p-align-l", "left"], ["p-align-c", "center"], ["p-align-r", "right"]]) $(id).onclick = () => text(o => o.set("textAlign", al));
        $("p-spacing").oninput = e => text(o => o.set("charSpacing", +e.target.value), false);
        $("p-spacing").onchange = () => text(() => {});
        $("p-curve").oninput = e => text(o => o.set("textCurve", +e.target.value), false);
        $("p-curve").onchange = () => text(() => {});

        const adjust = (content = true) => { const o = one(); if (!o || o.type !== "image") return;
            const a = { hue: +$("p-hue").value, sat: +$("p-sat").value, bright: +$("p-bright").value, tintColor: $("p-tint").value, tint: +$("p-tint-a").value };
            o.adjust = a;
            const f = [];
            if (a.hue) f.push(new fabric.filters.HueRotation({ rotation: a.hue / 180 }));
            if (a.sat) f.push(new fabric.filters.Saturation({ saturation: a.sat / 100 }));
            if (a.bright) f.push(new fabric.filters.Brightness({ brightness: a.bright / 100 }));
            if (a.tint) f.push(new fabric.filters.BlendColor({ color: a.tintColor, mode: "tint", alpha: a.tint / 100 }));
            o.filters = f; o.applyFilters();
            done(o, content); };
        for (const id of ["p-hue", "p-sat", "p-bright", "p-tint-a"]) { $(id).oninput = () => adjust(false); $(id).onchange = () => adjust(); }
        $("p-tint").oninput = () => { if (+$("p-tint-a").value === 0) $("p-tint-a").value = 100; adjust(false); };
        $("p-tint").onchange = () => adjust();
    }

    // ---------- UI wiring ----------
    initUI() {
        // fonts
        for (const sel of [$("opt-font"), $("p-font")]) sel.innerHTML = FONTS.map(f => `<option style="font-family:'${f}'">${f}</option>`).join("");
        $("opt-font").value = "Bebas Neue";
        // commands
        document.addEventListener("click", e => {
            const b = e.target.closest("[data-cmd]");
            const menu = e.target.closest(".menu");
            document.querySelectorAll(".menu.open").forEach(m => { if (m !== menu) m.classList.remove("open"); });
            if (e.target.closest(".menu-btn")) { menu.classList.toggle("open"); return; }
            if (b) { document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open")); this.hideContext(); this.run(b.dataset.cmd); return; }
            if (!e.target.closest("#ctxmenu")) this.hideContext();
            if (!e.target.closest("#shape-popover") && !e.target.closest("#opt-shape-pick")) $("shape-popover").hidden = true;
        });
        document.querySelectorAll(".menu").forEach(m => m.addEventListener("mouseenter", () => {
            if (document.querySelector(".menu.open") && !m.classList.contains("open")) {
                document.querySelectorAll(".menu.open").forEach(x => x.classList.remove("open")); m.classList.add("open"); }
        }));
        document.querySelectorAll(".tool").forEach(b => b.onclick = () => this.setTool(b.dataset.tool));
        // shape picker
        const icon = d => `<svg viewBox="-4 -4 108 108"><path d="${d}" fill-rule="evenodd"/></svg>`;
        $("shape-grid").innerHTML = Object.entries(SHAPES).map(([k, s]) => `<button data-shape="${k}" title="${s.name}">${icon(s.d)}</button>`).join("");
        const showShape = () => { $("opt-shape-pick").innerHTML = icon(SHAPES[this.shape].d) + SHAPES[this.shape].name;
            document.querySelectorAll("#shape-grid button").forEach(b => b.classList.toggle("on", b.dataset.shape === this.shape)); };
        showShape();
        $("opt-shape-pick").onclick = () => { const p = $("shape-popover"), r = $("opt-shape-pick").getBoundingClientRect();
            p.style.left = r.left + "px"; p.style.top = r.bottom + 6 + "px"; p.hidden = !p.hidden; };
        $("shape-grid").onclick = e => { const b = e.target.closest("button"); if (!b) return; this.shape = b.dataset.shape; showShape(); $("shape-popover").hidden = true; this.setTool("shape"); };
        // tool options
        const sync = (a, b) => { $(a).oninput = () => { $(b).value = $(a).value; if (this.canvas.isDrawingMode) this.setupBrush(); }; };
        sync("opt-size", "opt-size-n"); sync("opt-size-n", "opt-size");
        for (const [id, out, suf] of [["opt-opacity", "opt-opacity-v", "%"], ["opt-soft", "opt-soft-v", "%"], ["opt-tolerance", "opt-tolerance-v", ""]])
            $(id).addEventListener("input", () => { $(out).textContent = $(id).value + suf; if (this.canvas.isDrawingMode) this.setupBrush(); });
        for (const id of ["opt-brush-kind", "opt-erase-target"]) $(id).onchange = () => this.setupBrush();
        $("color-fg").addEventListener("input", () => { if (this.canvas.isDrawingMode) this.setupBrush(); });
        $("color-swap").onclick = () => { const a = $("color-fg").value; $("color-fg").value = $("color-bg").value; $("color-bg").value = a; if (this.canvas.isDrawingMode) this.setupBrush(); };
        this.bindProps();
        // files
        $("file-image").onchange = async e => { for (const f of e.target.files) await this.importImage(f).catch(err => toast(err.message, true)); e.target.value = ""; };
        $("file-base").onchange = async e => { const f = e.target.files[0]; if (f) await this.useAsTemplate(f).catch(err => toast(err.message, true)); e.target.value = ""; };
        $("file-project").onchange = async e => { const f = e.target.files[0]; if (f) await this.loadProject(await f.text()).catch(err => toast(err.message, true)); e.target.value = ""; };
        // drop & paste
        const stage = $("stage");
        stage.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); });
        stage.addEventListener("drop", async e => {
            e.preventDefault();
            for (const f of e.dataTransfer.files) {
                try {
                    if (/\.json$/i.test(f.name)) await this.loadProject(await f.text());
                    else if (/\.zip$/i.test(f.name)) { openTemplateDialog(this, "game"); await openGameZip(this, f); }
                    else await this.importImage(f);
                } catch (err) { toast(err.message, true); }
            }
        });
        document.addEventListener("paste", async e => {
            if (e.target.closest("input, textarea")) return;
            const files = [...e.clipboardData.files];
            if (files.length) { e.preventDefault(); for (const f of files) await this.importImage(f); }
            else if (this.clipboard) this.run("paste");
        });
        // keyboard
        document.addEventListener("keydown", e => this.onKey(e));
        document.addEventListener("keyup", e => { if (e.code === "Space") { this.space = false; if (this.tool !== "hand") $("stage").classList.remove("hand"); } });
        // dialogs close
        document.querySelectorAll("dialog [data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
        $("exp-go").onclick = () => { $("dlg-export").close(); this.exportSkin(); this.autosave(); };
        window.addEventListener("beforeunload", () => { if (this.hasDoc) idbSet("autosave", this.projectJSON(false)); });
    }

    onKey(e) {
        const typing = e.target.closest?.("input, textarea, select") || this.canvas.getActiveObject()?.isEditing;
        if (typing) {
            if (e.key === "Escape" && this.canvas.getActiveObject()?.isEditing) { this.canvas.getActiveObject().exitEditing(); this.canvas.requestRenderAll(); }
            return;
        }
        if (document.querySelector("dialog[open]")) return;
        const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
        const cmd = c => { e.preventDefault(); this.run(c); };
        if (ctrl) {
            if (k === "z" && !e.shiftKey) return cmd("undo");
            if (k === "y" || (k === "z" && e.shiftKey)) return cmd("redo");
            if (k === "c") return cmd("copy");
            if (k === "x") return cmd("cut");
            if (k === "v") return;                 // the paste event handles it (pictures too)
            if (k === "d") return cmd("duplicate");
            if (k === "a") return cmd("selectAll");
            if (k === "g") return cmd(e.shiftKey ? "ungroup" : "group");
            if (k === "s") return cmd("saveProject");
            if (k === "o") return cmd("openProject");
            if (k === "e") return cmd("export");
            if (k === "i") return cmd("importImage");
            if (k === "n" && e.shiftKey) return cmd("template");
            if (k === "0") return cmd("fit");
            if (k === "1") return cmd("actual");
            if (e.key === "]") return cmd(e.shiftKey ? "front" : "forward");
            if (e.key === "[") return cmd(e.shiftKey ? "back" : "backward");
            return;
        }
        if (e.code === "Space") { if (!this.space) { this.space = true; $("stage").classList.add("hand"); } e.preventDefault(); return; }
        if (e.key === "Delete" || e.key === "Backspace") return cmd("delete");
        if (e.key === "Escape") {
            if (this.pen) { const p = this.pen; this.pen = null; if (p.preview) this.canvas.remove(p.preview); this.canvas.requestRenderAll(); return; }
            const a = this.canvas.getActiveObject();
            if (a?.isEditingPoints) { this.toggleEditPoints(a, false); return; }
            this.canvas.discardActiveObject(); this.canvas.requestRenderAll(); return;
        }
        if (e.key === "Enter") {
            if (this.pen) { this.finishPen(false); return; }
            const a = this.canvas.getActiveObject();
            if (a?.type === "path") { e.preventDefault(); this.toggleEditPoints(a); }
            if (a?.isType?.("IText")) { e.preventDefault(); a.enterEditing(); a.selectAll(); }
            return;
        }
        if (e.key.startsWith("Arrow")) {
            const a = this.canvas.getActiveObject();
            if (!a) return;
            e.preventDefault();
            const s = e.shiftKey ? 10 : 1;
            if (e.key === "ArrowLeft") a.left -= s; if (e.key === "ArrowRight") a.left += s;
            if (e.key === "ArrowUp") a.top -= s; if (e.key === "ArrowDown") a.top += s;
            a.setCoords(); if (!a.isType("ActiveSelection")) this.syncMirror(a);
            this.canvas.requestRenderAll(); this.updatePropsLive(); this.commitSoon();
            return;
        }
        if (e.key === "[" || e.key === "]") {
            const v = clamp(+$("opt-size").value * (e.key === "]" ? 1.25 : 0.8), 1, 400);
            $("opt-size").value = $("opt-size-n").value = Math.round(v);
            if (this.canvas.isDrawingMode) this.setupBrush();
            return;
        }
        if (e.key === "+" || e.key === "=") return cmd("zoomIn");
        if (e.key === "-") return cmd("zoomOut");
        if (e.key === "?") return cmd("help");
        const tools = { v: "select", h: "hand", b: "brush", e: "eraser", f: "fill", g: "gradient", u: "shape", l: "line", p: "pen", t: "text", i: "eyedropper" };
        if (tools[k] && this.hasDoc) { e.preventDefault(); this.setTool(tools[k]); return; }
        if (k === "x") $("color-swap").click();
    }

    // ---------- bundled templates ----------
    async loadManifest() {
        try { this.manifest = await (await fetch("Assets/manifest.json")).json(); }
        catch (e) { console.warn("No bundled templates", e); this.manifest = { vehicles: [] }; }
    }

    async loadBundled(v, file) {
        const tries = file ? [file] : ["skinname.dds", "SKINNAME.dds"];
        let res;
        for (const f of tries) { res = await fetch(`Assets/vehicles/${v.id}/${f}`); if (res.ok) break; }
        if (!res.ok) throw new Error(`The template for ${v.name} is missing from Assets/vehicles/${v.id}/`);
        const d = DDSDecoder.decode(await res.arrayBuffer());
        const c = document.createElement("canvas"); c.width = d.width; c.height = d.height;
        c.getContext("2d").putImageData(new ImageData(d.data, d.width, d.height), 0, 0);
        this.vehicle = { id: v.id, name: v.name, source: "bundled" };
        await this.setTemplate(c, { name: file ? (v.skins.find(s => s.file === file)?.name || "Template") : "Template" });
    }
}

// ---------- template dialog ----------
function openTemplateDialog(st, tab = "bundled") {
    const dlg = $("dlg-template");
    const show = t => {
        dlg.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
        dlg.querySelectorAll(".tabpage").forEach(p => p.hidden = p.dataset.page !== t);
    };
    dlg.querySelectorAll(".tab").forEach(b => b.onclick = () => show(b.dataset.tab));
    show(tab);
    const list = $("tpl-list");
    const draw = () => {
        const q = $("tpl-search").value.trim().toLowerCase();
        const vs = (st.manifest?.vehicles || []).filter(v => !q || v.name.toLowerCase().includes(q) || v.id.includes(q));
        list.innerHTML = "";
        for (const v of vs) {
            const variants = [{ label: "Standard", file: null }, ...(v.skins || []).map(s => ({ label: s.name, file: s.file }))];
            for (const va of variants) {
                const b = document.createElement("button");
                b.innerHTML = `<span></span><small></small>`;
                b.querySelector("span").textContent = v.name;
                b.querySelector("small").textContent = va.file ? va.label : v.id;
                b.onclick = async () => {
                    b.querySelector("small").textContent = "Loading…";
                    try { await st.loadBundled(v, va.file); dlg.close(); } catch (e) { toast(e.message, true, 6000); b.querySelector("small").textContent = v.id; }
                };
                list.appendChild(b);
            }
        }
        if (!vs.length) list.innerHTML = `<p class="muted">No match. Try the "From your BeamNG install" tab.</p>`;
    };
    $("tpl-search").oninput = draw;
    draw();
    setupGameTab(st);
    if (!dlg.open) dlg.showModal();
}

// ---------- templates from the player's own BeamNG install ----------
let gameDir = null;
function setupGameTab(st) {
    const folderBtn = $("game-pick-folder");
    folderBtn.hidden = !window.showDirectoryPicker;
    folderBtn.onclick = async () => {
        try {
            if (!gameDir) gameDir = await idbGet("gameDir");
            if (gameDir && (await gameDir.requestPermission({ mode: "read" })) !== "granted") gameDir = null;
            if (!gameDir) { gameDir = await window.showDirectoryPicker({ id: "beamng-vehicles", mode: "read" }); await idbSet("gameDir", gameDir); }
            await listGameFolder(st);
        } catch (e) { if (e.name !== "AbortError") toast(e.message, true); }
    };
    $("game-pick-zip").onclick = () => $("game-zip-input").click();
    $("game-zip-input").onchange = async e => { const f = e.target.files[0]; if (f) await openGameZip(st, f); e.target.value = ""; };
}

async function listGameFolder(st) {
    let dir = gameDir;
    // accept the game folder, content/ or content/vehicles/
    for (const sub of ["content", "vehicles"]) { try { dir = await dir.getDirectoryHandle(sub); } catch { /* already deeper */ } }
    const zips = [];
    for await (const [name, h] of dir.entries()) if (h.kind === "file" && /\.zip$/i.test(name)) zips.push({ name, h });
    zips.sort((a, b) => a.name.localeCompare(b.name));
    if (!zips.length) { toast("No vehicle zips there. Choose BeamNG.drive/content/vehicles.", true, 6000); return; }
    const box = $("game-vehicles"), search = $("game-search");
    search.hidden = false;
    const draw = () => {
        const q = search.value.trim().toLowerCase();
        box.innerHTML = "";
        for (const z of zips.filter(z => !q || z.name.toLowerCase().includes(q))) {
            const b = document.createElement("button");
            b.innerHTML = `<span></span><small>${z.name}</small>`;
            b.querySelector("span").textContent = z.name.replace(/\.zip$/i, "");
            b.onclick = async () => { box.querySelectorAll("button").forEach(x => x.classList.remove("on")); b.classList.add("on"); await openGameZip(st, await z.h.getFile()); };
            box.appendChild(b);
        }
    };
    search.oninput = draw;
    draw();
}

async function openGameZip(st, file) {
    const out = $("game-entries");
    out.innerHTML = `<p class="muted">Reading ${file.name}…</p>`;
    let zip;
    try { zip = await openZip(file); } catch (e) { out.innerHTML = ""; toast(e.message, true); return; }
    const id = file.name.replace(/\.zip$/i, "");
    let name = id;
    const info = zip.entries.find(e => new RegExp(`^vehicles/${id}/info\\.json$`, "i").test(e.name));
    if (info) {
        try {
            const j = JSON.parse(new TextDecoder().decode(await zip.read(info)).replace(/,\s*([}\]])/g, "$1"));
            // newer vehicles name themselves with a translation key ("vehiclesData.percheron.Name")
            const nm = j.Name && !/^[\w]+(\.[\w]+)+$/.test(j.Name) ? j.Name : id.charAt(0).toUpperCase() + id.slice(1);
            name = [j.Brand, nm].filter(Boolean).join(" ");
        } catch { /* loose JSON: keep the id */ }
    }
    const uv = zip.entries.filter(e => /(uv|uvs|uvlayout|uvskin)[^/]*\.(png|jpg|dds)$/i.test(e.name.split("/").pop())
        && !/\.color\.|\.data\.|normal|_n\.|_uv\d\.dds$/i.test(e.name));
    const skins = zip.entries.filter(e => /skin[^/]*\.dds$/i.test(e.name) && /\.color\.dds$|_uv\d?\.dds$/i.test(e.name));
    // the skin's real resolution, from a skin texture's header (the UV pictures are often smaller)
    let size = null;
    for (const s of skins.slice(0, 3)) {
        try {
            const h = await readHead(zip.file, s, 148);
            const v = new DataView(h.buffer, h.byteOffset, h.byteLength);
            const H = v.getUint32(12, true), W = v.getUint32(16, true);
            if (!size || W * H > size[0] * size[1]) size = [W, H];
        } catch { /* skip */ }
    }
    const vehicle = { id, name, source: "game" };
    const load = async (entry, isSkin, btn) => {
        btn.querySelector("small").textContent = "Loading…";
        try {
            const buf = await zip.read(entry);
            let el;
            if (/\.dds$/i.test(entry.name)) {
                const d = DDSDecoder.decode(buf);
                el = document.createElement("canvas"); el.width = d.width; el.height = d.height;
                el.getContext("2d").putImageData(new ImageData(d.data, d.width, d.height), 0, 0);
            } else el = await createImageBitmap(new Blob([buf]));
            const fname = entry.name.split("/").pop();
            if (isSkin) {
                // an existing skin: the document is the skin, and the skin itself becomes the bottom layer to paint over
                st.vehicle = vehicle;
                const tplEntry = uv[0];
                let tpl = el;
                if (tplEntry) {
                    const tb = await zip.read(tplEntry);
                    tpl = /\.dds$/i.test(tplEntry.name) ? (() => { const d = DDSDecoder.decode(tb); const c = document.createElement("canvas"); c.width = d.width; c.height = d.height; c.getContext("2d").putImageData(new ImageData(d.data, d.width, d.height), 0, 0); return c; })()
                        : await createImageBitmap(new Blob([tb]));
                }
                await st.setTemplate(tpl, { name: tplEntry ? tplEntry.name.split("/").pop() : fname, vehicle, size: [el.width, el.height] });
                const c = el instanceof HTMLCanvasElement ? el : st.toCanvas(el);
                const img = await fabric.FabricImage.fromURL(c.toDataURL("image/png"));
                img.set({ left: st.W / 2, top: st.H / 2, scaleX: st.W / img.width, scaleY: st.H / img.height, name: fname.replace(/\.dds$/i, "") });
                st.addObject(img, { select: false });
            } else {
                await st.setTemplate(el, { name: fname, vehicle, size });
            }
            $("dlg-template").close();
            if (/_p\.color\.dds$|palette/i.test(entry.name)) toast("That's a palette skin: its red, green and blue areas take the car's three paint colours in game.", false, 7000);
        } catch (e) { toast(e.message, true, 6000); btn.querySelector("small").textContent = "Couldn't open"; }
    };
    out.innerHTML = `<h4>${escapeHtml(name)}: UV templates</h4><div class="tpl-grid" id="g-uv"></div><h4>Existing skins (start from one)</h4><div class="tpl-grid" id="g-skins"></div>`;
    const add = (box, entry, isSkin, sub) => {
        const b = document.createElement("button");
        b.innerHTML = `<span></span><small></small>`;
        b.querySelector("span").textContent = entry.name.split("/").pop();
        b.querySelector("small").textContent = sub;
        b.onclick = () => load(entry, isSkin, b);
        $(box).appendChild(b);
    };
    uv.forEach(e => add("g-uv", e, false, size ? `opens at ${size[0]} × ${size[1]} (the skin size)` : "UV layout"));
    skins.forEach(e => add("g-skins", e, true, (e.uncompSize / 1048576).toFixed(1) + " MB"));
    if (!uv.length) $("g-uv").innerHTML = `<p class="muted small">No UV template in this zip. Start from a skin below, or pick another vehicle.</p>`;
    if (!skins.length) $("g-skins").innerHTML = `<p class="muted small">No skins in this zip.</p>`;
}

const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function openExport(st) {
    const vis = st.layerObjects().filter(o => o.visible).length;
    $("exp-info").textContent = `${st.W} × ${st.H} px · ${vis} visible layer${vis === 1 ? "" : "s"}` +
        (st.vehicle ? ` · ${st.vehicle.name}` : "") + (st.W * st.H > 8388608 ? " · the .dds will be about " + Math.round(st.W * st.H * 4 / 1048576) + " MB" : "");
    $("dlg-export").showModal();
}

async function loadFont(f) {
    try { await document.fonts.load(`64px "${f}"`); } catch { /* system font */ }
}

function blobToDataURL(b) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
}

// ---------- IndexedDB (autosave, the remembered game folder) ----------
function idb() {
    return idb.p ||= new Promise((res, rej) => {
        const r = indexedDB.open("livery-studio", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
}
async function idbSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const r = db.transaction("kv").objectStore("kv").get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

document.fonts.ready.then(() => { window.studio = new Studio(); });
