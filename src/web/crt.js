// Runs the CRT shader passes (src/shader/crt.js) from a source canvas to a WebGL canvas.
import { VERT, SIGNAL_FRAG, PHOSPHOR_FRAG, BLUR_FRAG, TUBE_FRAG } from '../shader/crt.js';

export class CRT {
  constructor(out, src) {
    this.out = out; this.src = src; this.frame = 0; this.degauss = 0; this.flip = 0;
    const gl = (this.gl = out.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true }));
    if (!gl) throw new Error('WebGL unavailable');
    const prog = (frag) => {
      const p = gl.createProgram();
      for (const [type, text] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, frag]]) {
        const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      gl.bindAttribLocation(p, 0, 'a_pos'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
      return { p, u };
    };
    this.P = { signal: prog(SIGNAL_FRAG), phosphor: prog(PHOSPHOR_FRAG), blur: prog(BLUR_FRAG), tube: prog(TUBE_FRAG) };
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const w = src.width, h = src.height;
    this.srcTex = this._tex(w, h).tex;
    this.signal = this._tex(w, h, true);
    this.glow = [this._tex(w, h, true), this._tex(w, h, true)];
    this.blur = [this._tex(w >> 1, h >> 1, true), this._tex(w >> 1, h >> 1, true)];
  }
  _tex(w, h, target = false) {
    const gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    let fb = null;
    if (target) { fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); }
    return { tex, fb, w, h };
  }
  _pass(prog, target, textures, uniforms) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : this.out.width, target ? target.h : this.out.height);
    gl.useProgram(prog.p);
    Object.entries(textures).forEach(([name, tex], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(prog.u[name], i); });
    for (const [name, v] of Object.entries(uniforms)) { if (!(name in prog.u)) continue; if (Array.isArray(v)) gl.uniform2f(prog.u[name], v[0], v[1]); else gl.uniform1f(prog.u[name], v); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  // o: { curve, rf, composite, scan, glow, mask (0..1), maskType (0 grille, 1 slot, 2 dots), persist, calm }
  render(o) {
    const gl = this.gl, { src, out } = this;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(320, Math.round(out.clientWidth * dpr)), H = Math.round((W * src.height) / src.width);
    if (out.width !== W || out.height !== H) { out.width = W; out.height = H; }
    this.frame++; this.degauss *= 0.965;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const res = [src.width, src.height], prev = this.glow[this.flip], next = this.glow[(this.flip ^= 1)];
    this._pass(this.P.signal, this.signal, { u_src: this.srcTex }, { u_res: res, u_frame: this.frame, u_rf: o.rf, u_composite: o.composite });
    this._pass(this.P.phosphor, next, { u_cur: this.signal.tex, u_prev: prev.tex }, { u_persist: o.persist });
    this._pass(this.P.blur, this.blur[0], { u_tex: next.tex }, { u_step: [2.2 / this.blur[0].w, 0] });
    this._pass(this.P.blur, this.blur[1], { u_tex: this.blur[0].tex }, { u_step: [0, 2.2 / this.blur[0].h] });
    this._pass(this.P.tube, null, { u_tex: next.tex, u_bloom: this.blur[1].tex }, {
      u_out: [W, H], u_frame: this.frame, u_curve: o.curve, u_scan: o.scan, u_glow: o.glow, u_maskAmt: o.mask, u_maskType: o.maskType,
      u_maskScale: Math.max(1, Math.round(W / 900)), u_interlace: o.calm ? 0 : 1, u_flicker: o.calm ? 0 : 1, u_degauss: Math.min(1, this.degauss),
    });
  }
}
