export declare const MARKERS: string[];
export declare const DEBUG_MARKERS: string[];
export declare function debugBuild(processEnv: Record<string, string | undefined>, envFileText: string): boolean;
export declare function markersFor(debug: boolean): string[];
export declare function findMarkers(dir: string, markers?: string[]): string[];
