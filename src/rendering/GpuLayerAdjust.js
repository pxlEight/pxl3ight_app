/**
 * GPU-accelerated layer adjustment (HSV offsets + contrast) using a tiny WebGL fragment shader.
 *
 * Mirrors the math of the LAYER_ADJUST routine in WorkerManager.js so results match the CPU path.
 * The source ImageData is uploaded to the GPU once (setSource) and re-processed cheaply for every
 * slider change (process). If WebGL is unavailable, too small/large, or the context is lost, every
 * method fails soft (returns false/null) so the caller can fall back to the worker implementation.
 */
export default class GpuLayerAdjust {
    constructor() {
        this.canvas = null;
        this.gl = null;
        this.program = null;
        this.texture = null;
        this.uniforms = {};
        this.width = 0;
        this.height = 0;
        this.hasSource = false;
        this.unavailable = false;
    }

    _init() {
        if (this.gl) return !this.gl.isContextLost();
        if (this.unavailable) return false;

        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl', {
                alpha: true,
                premultipliedAlpha: false,
                antialias: false,
                depth: false,
                stencil: false,
                preserveDrawingBuffer: true
            });
            if (!gl) throw new Error('WebGL unavailable');

            const vs = this._compile(gl, gl.VERTEX_SHADER, `
                attribute vec2 aPos;
                varying vec2 vUV;
                void main() {
                    vUV = aPos * 0.5 + 0.5;
                    gl_Position = vec4(aPos, 0.0, 1.0);
                }
            `);
            const fs = this._compile(gl, gl.FRAGMENT_SHADER, `
                #ifdef GL_FRAGMENT_PRECISION_HIGH
                precision highp float;
                #else
                precision mediump float;
                #endif
                varying vec2 vUV;
                uniform sampler2D uTex;
                uniform float uContrastFactor;
                uniform float uUseContrast;
                uniform float uUseHsv;
                uniform float uHOff;
                uniform float uSOff;
                uniform float uVOff;

                vec3 rgbToHsv(vec3 c) {
                    float mx = max(c.r, max(c.g, c.b));
                    float mn = min(c.r, min(c.g, c.b));
                    float d = mx - mn;
                    float h = 0.0;
                    float s = (mx == 0.0) ? 0.0 : d / mx;
                    if (d > 0.0) {
                        if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
                        else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
                        else h = (c.r - c.g) / d + 4.0;
                        h *= 60.0;
                    }
                    return vec3(h, s, mx);
                }

                vec3 hsvToRgb(float h, float s, float v) {
                    float i = floor(h / 60.0);
                    float f = h / 60.0 - i;
                    float p = v * (1.0 - s);
                    float q = v * (1.0 - f * s);
                    float t = v * (1.0 - (1.0 - f) * s);
                    float k = mod(i, 6.0);
                    if (k < 0.5) return vec3(v, t, p);
                    if (k < 1.5) return vec3(q, v, p);
                    if (k < 2.5) return vec3(p, v, t);
                    if (k < 3.5) return vec3(p, q, v);
                    if (k < 4.5) return vec3(t, p, v);
                    return vec3(v, p, q);
                }

                void main() {
                    vec4 px = texture2D(uTex, vUV);
                    // Fully transparent pixels are left untouched (same as the CPU path).
                    if (px.a == 0.0) { gl_FragColor = px; return; }

                    vec3 c = px.rgb;
                    if (uUseContrast > 0.5) {
                        c = clamp(uContrastFactor * (c * 255.0 - 128.0) + 128.0, 0.0, 255.0) / 255.0;
                    }
                    if (uUseHsv > 0.5) {
                        vec3 hsv = rgbToHsv(c);
                        hsv.x = mod(hsv.x + uHOff, 360.0);
                        hsv.y = clamp(hsv.y + uSOff / 100.0, 0.0, 1.0);
                        hsv.z = clamp(hsv.z + uVOff / 100.0, 0.0, 1.0);
                        c = hsvToRgb(hsv.x, hsv.y, hsv.z);
                    }
                    gl_FragColor = vec4(c, px.a);
                }
            `);

            const program = gl.createProgram();
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
            }
            gl.useProgram(program);

            // Fullscreen quad
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const loc = gl.getAttribLocation(program, 'aPos');
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

            this.uniforms = {
                tex: gl.getUniformLocation(program, 'uTex'),
                contrastFactor: gl.getUniformLocation(program, 'uContrastFactor'),
                useContrast: gl.getUniformLocation(program, 'uUseContrast'),
                useHsv: gl.getUniformLocation(program, 'uUseHsv'),
                hOff: gl.getUniformLocation(program, 'uHOff'),
                sOff: gl.getUniformLocation(program, 'uSOff'),
                vOff: gl.getUniformLocation(program, 'uVOff')
            };

            canvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                this.hasSource = false;
                this.gl = null;
                this.program = null;
                this.texture = null;
            });

            this.canvas = canvas;
            this.gl = gl;
            this.program = program;
            return true;
        } catch (err) {
            console.warn('GPU layer adjust unavailable, using worker fallback:', err);
            this.unavailable = true;
            this.gl = null;
            return false;
        }
    }

    _compile(gl, type, src) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
        }
        return shader;
    }

    /**
     * Uploads the unmodified layer pixels. Returns true if the GPU path is ready.
     * @param {ImageData} imageData
     */
    setSource(imageData) {
        this.hasSource = false;
        if (!imageData || !this._init()) return false;

        const gl = this.gl;
        const { width, height } = imageData;
        const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        if (width > maxSize || height > maxSize) return false;

        if (this.canvas.width !== width) this.canvas.width = width;
        if (this.canvas.height !== height) this.canvas.height = height;
        gl.viewport(0, 0, width, height);

        if (!this.texture) this.texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        // Upload raw, un-premultiplied bytes with no color conversion so values are exact.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.width = width;
        this.height = height;
        this.hasSource = true;
        return true;
    }

    /**
     * Runs the shader on the uploaded source and returns a new ImageData, or null on failure.
     */
    process({ hOff, sOff, vOff, contrast }) {
        if (!this.hasSource || !this.gl || this.gl.isContextLost()) return null;

        const gl = this.gl;
        const u = this.uniforms;
        const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(u.tex, 0);
        gl.uniform1f(u.contrastFactor, contrastFactor);
        gl.uniform1f(u.useContrast, contrast !== 0 ? 1 : 0);
        gl.uniform1f(u.useHsv, (hOff !== 0 || sOff !== 0 || vOff !== 0) ? 1 : 0);
        gl.uniform1f(u.hOff, hOff);
        gl.uniform1f(u.sOff, sOff);
        gl.uniform1f(u.vOff, vOff);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        const pixels = new Uint8ClampedArray(this.width * this.height * 4);
        gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        if (gl.getError() !== gl.NO_ERROR) return null;
        return new ImageData(pixels, this.width, this.height);
    }

    /** Frees GPU memory held for the current source image. */
    release() {
        this.hasSource = false;
        if (this.gl && this.texture && !this.gl.isContextLost()) {
            this.gl.deleteTexture(this.texture);
        }
        this.texture = null;
    }
}
