let wasm_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    /**
     * Result of maze generation, returned to JS as a flat struct via wasm-bindgen.
     * Note: `grid` is private and exposed via a method, because wasm-bindgen struct
     * fields must be Copy; Vec<u8> is returned as a Uint8Array via a plain method.
     *
     * `rng_state` is the PRNG state AFTER generation, so JS can continue the same
     * deterministic sequence for enemy/key/powerup placement and runtime ticks.
     */
    class Maze {
        static __wrap(ptr) {
            const obj = Object.create(Maze.prototype);
            obj.__wbg_ptr = ptr;
            MazeFinalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }
        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            MazeFinalization.unregister(this);
            return ptr;
        }
        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_maze_free(ptr, 0);
        }
        /**
         * @returns {number}
         */
        get exit_x() {
            const ret = wasm.__wbg_get_maze_exit_x(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {number}
         */
        get exit_y() {
            const ret = wasm.__wbg_get_maze_exit_y(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {number}
         */
        get height() {
            const ret = wasm.__wbg_get_maze_height(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {number}
         */
        get rng_state() {
            const ret = wasm.__wbg_get_maze_rng_state(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {number}
         */
        get start_x() {
            const ret = wasm.__wbg_get_maze_start_x(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {number}
         */
        get start_y() {
            const ret = wasm.__wbg_get_maze_start_y(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {number}
         */
        get width() {
            const ret = wasm.__wbg_get_maze_width(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * Flat grid accessor for JS. Returns a Uint8Array (WALL=0, PATH=1, EXIT=2, START=3).
         * @returns {Uint8Array}
         */
        grid() {
            const ret = wasm.maze_grid(this.__wbg_ptr);
            var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
            return v1;
        }
        /**
         * @param {number} arg0
         */
        set exit_x(arg0) {
            wasm.__wbg_set_maze_exit_x(this.__wbg_ptr, arg0);
        }
        /**
         * @param {number} arg0
         */
        set exit_y(arg0) {
            wasm.__wbg_set_maze_exit_y(this.__wbg_ptr, arg0);
        }
        /**
         * @param {number} arg0
         */
        set height(arg0) {
            wasm.__wbg_set_maze_height(this.__wbg_ptr, arg0);
        }
        /**
         * @param {number} arg0
         */
        set rng_state(arg0) {
            wasm.__wbg_set_maze_rng_state(this.__wbg_ptr, arg0);
        }
        /**
         * @param {number} arg0
         */
        set start_x(arg0) {
            wasm.__wbg_set_maze_start_x(this.__wbg_ptr, arg0);
        }
        /**
         * @param {number} arg0
         */
        set start_y(arg0) {
            wasm.__wbg_set_maze_start_y(this.__wbg_ptr, arg0);
        }
        /**
         * @param {number} arg0
         */
        set width(arg0) {
            wasm.__wbg_set_maze_width(this.__wbg_ptr, arg0);
        }
    }
    if (Symbol.dispose) Maze.prototype[Symbol.dispose] = Maze.prototype.free;
    exports.Maze = Maze;

    /**
     * Generate a maze of the given size from the given seed string.
     * Width/height are forced odd and clamped to >= 7, matching game.js.
     *
     * Returns a Maze whose grid is a flat Vec<u8> (WALL=0, PATH=1, EXIT=2,
     * START=3). Same seed + same size => same grid as the JS generator.
     * @param {number} width
     * @param {number} height
     * @param {string} seed
     * @returns {Maze}
     */
    function generate_maze(width, height, seed) {
        const ptr0 = passStringToWasm0(seed, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_maze(width, height, ptr0, len0);
        return Maze.__wrap(ret);
    }
    exports.generate_maze = generate_maze;
    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg___wbindgen_throw_ea4887a5f8f9a9db: function(arg0, arg1) {
                throw new Error(getStringFromWasm0(arg0, arg1));
            },
            __wbindgen_init_externref_table: function() {
                const table = wasm.__wbindgen_externrefs;
                const offset = table.grow(4);
                table.set(0, undefined);
                table.set(offset + 0, undefined);
                table.set(offset + 1, null);
                table.set(offset + 2, true);
                table.set(offset + 3, false);
            },
        };
        return {
            __proto__: null,
            "./laby_core_bg.js": import0,
        };
    }

    const MazeFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_maze_free(ptr, 1));

    function getArrayU8FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
    }

    function getStringFromWasm0(ptr, len) {
        return decodeText(ptr >>> 0, len);
    }

    let cachedUint8ArrayMemory0 = null;
    function getUint8ArrayMemory0() {
        if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
            cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
        }
        return cachedUint8ArrayMemory0;
    }

    function passStringToWasm0(arg, malloc, realloc) {
        if (realloc === undefined) {
            const buf = cachedTextEncoder.encode(arg);
            const ptr = malloc(buf.length, 1) >>> 0;
            getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
            WASM_VECTOR_LEN = buf.length;
            return ptr;
        }

        let len = arg.length;
        let ptr = malloc(len, 1) >>> 0;

        const mem = getUint8ArrayMemory0();

        let offset = 0;

        for (; offset < len; offset++) {
            const code = arg.charCodeAt(offset);
            if (code > 0x7F) break;
            mem[ptr + offset] = code;
        }
        if (offset !== len) {
            if (offset !== 0) {
                arg = arg.slice(offset);
            }
            ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
            const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
            const ret = cachedTextEncoder.encodeInto(arg, view);

            offset += ret.written;
            ptr = realloc(ptr, len, offset, 1) >>> 0;
        }

        WASM_VECTOR_LEN = offset;
        return ptr;
    }

    let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    function decodeText(ptr, len) {
        return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
    }

    const cachedTextEncoder = new TextEncoder();

    if (!('encodeInto' in cachedTextEncoder)) {
        cachedTextEncoder.encodeInto = function (arg, view) {
            const buf = cachedTextEncoder.encode(arg);
            view.set(buf);
            return {
                read: arg.length,
                written: buf.length
            };
        };
    }

    let WASM_VECTOR_LEN = 0;

    let wasmModule, wasmInstance, wasm;
    function __wbg_finalize_init(instance, module) {
        wasmInstance = instance;
        wasm = instance.exports;
        wasmModule = module;
        cachedUint8ArrayMemory0 = null;
        wasm.__wbindgen_start();
        return wasm;
    }

    async function __wbg_load(module, imports) {
        if (typeof Response === 'function' && module instanceof Response) {
            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    return await WebAssembly.instantiateStreaming(module, imports);
                } catch (e) {
                    const validResponse = module.ok && expectedResponseType(module.type);

                    if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                    } else { throw e; }
                }
            }

            const bytes = await module.arrayBuffer();
            return await WebAssembly.instantiate(bytes, imports);
        } else {
            const instance = await WebAssembly.instantiate(module, imports);

            if (instance instanceof WebAssembly.Instance) {
                return { instance, module };
            } else {
                return instance;
            }
        }

        function expectedResponseType(type) {
            switch (type) {
                case 'basic': case 'cors': case 'default': return true;
            }
            return false;
        }
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (module !== undefined) {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();
        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }
        const instance = new WebAssembly.Instance(module, imports);
        return __wbg_finalize_init(instance, module);
    }

    async function __wbg_init(module_or_path) {
        if (wasm !== undefined) return wasm;


        if (module_or_path !== undefined) {
            if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
                ({module_or_path} = module_or_path)
            } else {
                console.warn('using deprecated parameters for the initialization function; pass a single object instead')
            }
        }

        if (module_or_path === undefined && script_src !== undefined) {
            module_or_path = script_src.replace(/\.js$/, "_bg.wasm");
        }
        const imports = __wbg_get_imports();

        if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
            module_or_path = fetch(module_or_path);
        }

        const { instance, module } = await __wbg_load(await module_or_path, imports);

        return __wbg_finalize_init(instance, module);
    }

    return Object.assign(__wbg_init, { initSync }, exports);
})({ __proto__: null });
