/* tslint:disable */
/* eslint-disable */

export class InochiViewer {
    free(): void;
    [Symbol.dispose](): void;
    get_camera_x(): number;
    get_camera_y(): number;
    /**
     * Devuelve JSON con todos los parámetros y sus rangos:
     * [{"name":"...","min_x":f,"min_y":f,"max_x":f,"max_y":f,"def_x":f,"def_y":f,"is_vec2":b}]
     */
    get_params_json(): string;
    get_zoom(): number;
    constructor(canvas_id: string, model_data: Uint8Array);
    render(timestamp: number): void;
    resize(width: number, height: number): void;
    set_camera(x: number, y: number, zoom: number, rotation: number): void;
    /**
     * Encola un parámetro para el siguiente frame.
     */
    set_param(name: string, x: number, y: number): void;
    set_position(x: number, y: number): void;
    set_rotation(radians: number): void;
    set_zoom(zoom: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_inochiviewer_free: (a: number, b: number) => void;
    readonly inochiviewer_get_camera_x: (a: number) => number;
    readonly inochiviewer_get_camera_y: (a: number) => number;
    readonly inochiviewer_get_params_json: (a: number) => [number, number];
    readonly inochiviewer_get_zoom: (a: number) => number;
    readonly inochiviewer_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly inochiviewer_render: (a: number, b: number) => void;
    readonly inochiviewer_resize: (a: number, b: number, c: number) => void;
    readonly inochiviewer_set_camera: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly inochiviewer_set_param: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly inochiviewer_set_position: (a: number, b: number, c: number) => void;
    readonly inochiviewer_set_rotation: (a: number, b: number) => void;
    readonly inochiviewer_set_zoom: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
