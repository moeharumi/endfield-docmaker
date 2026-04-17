import docTempl from '$lib/assets/typst/official-doc.typ?raw';
import tuzhang from '$lib/assets/typst/tuzhang.typ?raw';
import fontXiaoBiaoSong from '$lib/assets/fonts/FZXIAOBIAOSONG-B05.TTF?url';
import fontSimFang from '$lib/assets/fonts/SIMFANG.TTF?url';
import fontSimHei from '$lib/assets/fonts/SIMHEI.TTF?url';
import fontSimKai from '$lib/assets/fonts/SIMKAI.TTF?url';
import fontTimesNewRoman from '$lib/assets/fonts/times.ttf?url';
import fontNotoSans from '$lib/assets/fonts/NotoSansCJKsc-Regular.otf?url';
import fontNotoSerif from '$lib/assets/fonts/NotoSerifCJKsc-Regular.otf?url';
import fontSTIXTwoMath from '$lib/assets/fonts/STIXTwoMath-Regular.otf?url';
import fontTeXGyreTermes from '$lib/assets/fonts/texgyretermes-math.otf?url';
import fontJBMono from '$lib/assets/fonts/JetBrainsMono-VariableFont_wght.ttf?url';

import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url';
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';
import { FetchPackageRegistry, MemoryAccessModel, $typst as typst } from '@myriaddreamin/typst.ts';
import { TypstSnippet } from '@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs';
import type { WritableAccessModel } from '@myriaddreamin/typst.ts/dist/esm/fs/index.mjs';
import type {
  PackageResolveContext,
  PackageSpec
} from '@myriaddreamin/typst.ts/dist/esm/internal.types.mjs';
import { tintImage, tintSvg, recenterSvg } from '$lib/utils/image';
import { dev } from '$app/environment';
import { base } from '$app/paths';
import { ISSUERS, setLogoScales } from './constants';
import { gzipSync } from 'fflate';
import { loadFontsWithCache } from '$lib/stores/fonts';

export const DEFAULT_FONTS: { name: string; url: string }[] = [
  { name: 'FZXIAOBIAOSONG-B05.TTF', url: fontXiaoBiaoSong },
  { name: 'SIMFANG.TTF', url: fontSimFang },
  { name: 'SIMHEI.TTF', url: fontSimHei },
  { name: 'SIMKAI.TTF', url: fontSimKai },
  { name: 'times.ttf', url: fontTimesNewRoman },
  { name: 'NotoSansCJKsc-Regular.otf', url: fontNotoSans },
  { name: 'NotoSerifCJKsc-Regular.otf', url: fontNotoSerif },
  { name: 'STIXTwoMath-Regular.otf', url: fontSTIXTwoMath },
  { name: 'texgyretermes-math.otf', url: fontTeXGyreTermes },
  { name: 'JetBrainsMono-VariableFont_wght.ttf', url: fontJBMono }
];

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
export const loadingState: { status: 'loading_fonts' | 'loading_wasm' | 'loading_templates' | '' } =
  $state({ status: '' });

const logoScales: Record<string, number> = {};
// Expose logo scales to template definitions
const syncLogoScales = () => setLogoScales({ ...logoScales });

const isGzipData = (data: Uint8Array): boolean =>
  data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
const isTarData = (data: Uint8Array): boolean =>
  data.length >= 262 &&
  data[257] === 0x75 && // u
  data[258] === 0x73 && // s
  data[259] === 0x74 && // t
  data[260] === 0x61 && // a
  data[261] === 0x72; // r

class InjectedRegistry extends FetchPackageRegistry {
  constructor(private am_: WritableAccessModel) {
    super(am_);
  }

  pullPackageData(path: PackageSpec): Uint8Array | undefined {
    const request = new XMLHttpRequest();
    request.overrideMimeType('text/plain; charset=x-user-defined');
    request.open('GET', this.resolvePath(path), false);
    request.send(null);

    if (
      request.status === 200 &&
      (request.response instanceof String || typeof request.response === 'string')
    ) {
      return Uint8Array.from(request.response, (char) => char.charCodeAt(0));
    }

    return undefined;
  }

  resolvePath(path: PackageSpec): string {
    switch (path.namespace) {
      case 'preview':
        return `https://packages.typst.org/preview/${path.name}-${path.version}.tar.gz`;
      case 'this':
        return `${base}/typst/${path.name}-${path.version}.tar.gz`;
      default:
        return super.resolvePath(path);
    }
  }

  resolve(spec: PackageSpec, context: PackageResolveContext): string | undefined {
    if (spec.namespace !== 'preview' && spec.namespace !== 'this') {
      return undefined;
    }

    // Check cache
    const path = this.resolvePath(spec);
    if (this.cache.has(path)) {
      return this.cache.get(path)!();
    }

    // Fetch data
    const data = this.pullPackageData(spec);
    if (!data) {
      return undefined;
    }
    const normalizedData = !isGzipData(data) && isTarData(data) ? gzipSync(data) : data;
    if (!isGzipData(normalizedData)) {
      const firstBytes = Array.from(data.subarray(0, 8))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' ');
      throw new Error(
        `Package ${spec.namespace}/${spec.name}:${spec.version} is not gzip data (first bytes: ${firstBytes})`
      );
    }

    // Extract package bundle to the underlying access model `this.am`
    const previewDir = `/@memory/fetch/packages/${spec.namespace}/${spec.name}/${spec.version}`;
    const entries: [string, Uint8Array, Date][] = [];
    context.untar(normalizedData, (path: string, data: Uint8Array, mtime: number) => {
      entries.push([previewDir + '/' + path, data, new Date(mtime)]);
    });
    const cacheClosure = () => {
      for (const [path, data, mtime] of entries) {
        this.am_.insertFile(path, data, mtime);
      }

      // Return the resolved directory to the package
      // It is then used to access the package data by the access model `this.am`
      return previewDir;
    };
    this.cache.set(path, cacheClosure);

    // Trigger write out
    return cacheClosure();
  }
}

const fetchGzip = async (url: string): Promise<Response> => {
  const res = await fetch(url);
  const decompressed = res.body!.pipeThrough(new DecompressionStream('gzip'));
  return new Response(decompressed, { headers: { 'Content-Type': 'application/wasm' } });
};

export const initializeTypst = async () => {
  if (initializationPromise) {
    return initializationPromise;
  }
  if (dev) {
    const globalWithTypst = globalThis as typeof globalThis & {
      typst?: typeof initializationPromise;
    };
    if (globalWithTypst.typst) {
      initializationPromise = globalWithTypst.typst;
      return initializationPromise;
    }
  }

  if (isInitialized) {
    return;
  }

  initializationPromise = (async () => {
    try {
      // Prepare fonts (with IndexedDB caching)
      loadingState.status = 'loading_fonts';
      const fontsVersion: string = __FONTS_VERSION__;
      const defaultBlobUrls = await loadFontsWithCache(DEFAULT_FONTS, fontsVersion);

      // Also load any custom fonts from IndexedDB
      const { getAllFonts } = await import('$lib/stores/fonts');
      const allCached = await getAllFonts();
      const customFonts = allCached.filter((f) => f.custom);
      const customBlobUrls = customFonts.map((f) => {
        const blob = new Blob([new Uint8Array(f.data)], { type: 'font/woff2' });
        return URL.createObjectURL(blob);
      });

      const blobUrls = [...defaultBlobUrls, ...customBlobUrls];

      // Configure WASM modules before any calls that trigger lazy init
      loadingState.status = 'loading_wasm';
      const accessModel = new MemoryAccessModel();
      const injectedRegistry = new InjectedRegistry(accessModel);

      typst.setCompilerInitOptions({
        getModule: () => (dev ? compilerWasmUrl : fetchGzip(compilerWasmUrl + '.gz'))
      });
      typst.setRendererInitOptions({
        getModule: () => rendererWasmUrl
      });
      typst.use(
        TypstSnippet.withPackageRegistry(injectedRegistry),
        TypstSnippet.withAccessModel(accessModel),
        TypstSnippet.disableDefaultFontAssets(),
        TypstSnippet.preloadFonts(blobUrls)
      );

      // Load template files and assets (triggers compiler init)
      loadingState.status = 'loading_templates';
      await typst.addSource('/official-doc.typ', docTempl);
      await typst.addSource('/tuzhang.typ', tuzhang);

      // Tint logos and register as shadow files
      await Promise.all(
        ISSUERS.map(async (issuer) => {
          if (issuer.type === 'svg') {
            const { svg: recentered, scale } = await recenterSvg(issuer.raw);
            console.log(issuer.key, scale);
            logoScales[issuer.key] = scale;
            const redTinted = tintSvg(recentered, [220, 0, 0]);
            const blackTinted = tintSvg(issuer.raw, [0, 0, 0], 0.25);
            await Promise.all([
              typst.mapShadow(`/stamp-${issuer.key}.svg`, redTinted),
              typst.mapShadow(`/watermark-${issuer.key}.svg`, blackTinted)
            ]);
          } else {
            const [{ image: redTinted, scale: scale }, { image: blackTinted }] = await Promise.all([
              tintImage(issuer.url, [210, 0, 0], 1, true),
              tintImage(issuer.url, [0, 0, 0], 0.25)
            ]);
            console.log(issuer.key, scale);
            logoScales[issuer.key] = scale;
            await Promise.all([
              typst.mapShadow(`/stamp-${issuer.key}.png`, redTinted),
              typst.mapShadow(`/watermark-${issuer.key}.png`, blackTinted)
            ]);
          }
        })
      );

      isInitialized = true;
      syncLogoScales();
      loadingState.status = '';
      console.log(`Typst initialized`);
    } catch (e) {
      console.error('Error initializing Typst:', e);
      initializationPromise = null;
      throw e;
    }
  })();

  if (dev) {
    (globalThis as typeof globalThis & { typst?: typeof initializationPromise }).typst =
      initializationPromise;
  }

  return initializationPromise;
};

export const waitForTypst = async () => {
  if (isInitialized) return;
  if (initializationPromise) {
    await initializationPromise;
  } else {
    await initializeTypst();
  }
};

export default typst;
