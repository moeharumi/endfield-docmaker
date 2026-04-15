import docTempl from '$lib/assets/typst/official-doc.typ?raw';
import tuzhang from '$lib/assets/typst/tuzhang.typ?raw';
import fontXiaoBiaoSong from '$lib/assets/fonts/FZXIAOBIAOSONG-B05.TTF?url';
import fontSimFang from '$lib/assets/fonts/SIMFANG.TTF?url';
import fontSimHei from '$lib/assets/fonts/SIMHEI.TTF?url';
import fontSimKai from '$lib/assets/fonts/SIMKAI.TTF?url';
import fontSTSong from '$lib/assets/fonts/STSONG.TTF?url';
import fontJBMono from '$lib/assets/fonts/JetBrainsMono-VariableFont_wght.ttf?url';
import fontNewCMMath from '$lib/assets/fonts/NewCMMath-Regular.otf?url';

import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url';
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';
import { FetchPackageRegistry, MemoryAccessModel, $typst as typst } from '@myriaddreamin/typst.ts';
import { TypstSnippet } from '@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs';
import type { WritableAccessModel } from '@myriaddreamin/typst.ts/dist/esm/fs/index.mjs';
import type {
  PackageResolveContext,
  PackageSpec
} from '@myriaddreamin/typst.ts/dist/esm/internal.types.mjs';
import { getFontBlobUrl } from '$lib/utils';
import { tintImage, tintSvg, recenterSvg } from '$lib/utils/image';
import { dev } from '$app/environment';
import type { IssuerKey, Authority } from './types';
import { ISSUERS } from './constants';
import { m } from '$lib/paraglide/messages';

const fonts: { name: string; url: string }[] = [
  { name: 'FZXIAOBIAOSONG-B05.TTF', url: fontXiaoBiaoSong },
  { name: 'SIMFANG.TTF', url: fontSimFang },
  { name: 'SIMHEI.TTF', url: fontSimHei },
  { name: 'SIMKAI.TTF', url: fontSimKai },
  { name: 'STSONG.TTF', url: fontSTSong },
  { name: 'JetBrainsMono-VariableFont_wght.ttf', url: fontJBMono },
  { name: 'NewCMMath-Regular.otf', url: fontNewCMMath }
];

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
export const loadingState: { status: 'loading_fonts' | 'loading_wasm' | 'loading_templates' | '' } =
  $state({ status: '' });

const logoScales: Record<string, number> = {};

// let isFontsLoaded = false;
// let fontsLoadPromise: Promise<{ fileName: string; url: string }[]> | null = null;
// let cachedFonts: { fileName: string; url: string }[] = [];

class InjectedRegistry extends FetchPackageRegistry {
  constructor(private am_: WritableAccessModel) {
    super(am_);
  }

  resolvePath(path: PackageSpec): string {
    switch (path.namespace) {
      case 'preview':
        return `https://packages.typst.org/preview/${path.name}-${path.version}.tar.gz`;
      default:
        return super.resolvePath(path);
    }
  }

  resolve(spec: PackageSpec, context: PackageResolveContext): string | undefined {
    if (spec.namespace !== 'preview') {
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

    // Extract package bundle to the underlying access model `this.am`
    const previewDir = `/@memory/fetch/packages/${spec.namespace}/${spec.name}/${spec.version}`;
    const entries: [string, Uint8Array, Date][] = [];
    context.untar(data, (path: string, data: Uint8Array, mtime: number) => {
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

// export const preloadFonts = async (): Promise<{ fileName: string; url: string }[]> => {
//   if (fontsLoadPromise) {
//     return fontsLoadPromise;
//   }

//   if (isFontsLoaded) {
//     return cachedFonts;
//   }

//   fontsLoadPromise = (async () => {
//     try {
//       const loaded = await loadFontsWithCache(fonts);
//       cachedFonts = loaded;
//       isFontsLoaded = true;
//       return loaded;
//     } catch (e) {
//       console.error('Error preloading fonts:', e);
//       fontsLoadPromise = null;
//       throw e;
//     }
//   })();

//   return fontsLoadPromise;
// };

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
      // Prepare fonts
      loadingState.status = 'loading_fonts';
      const blobUrls = await Promise.all(fonts.map((f) => getFontBlobUrl(f.url)));

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

export const getTypstDocument = ({
  issuer,
  authorities,
  docTitle,
  refNo,
  issueDate: { year, month, day },
  docContent
}: {
  issuer: IssuerKey;
  authorities: Authority[];
  docTitle: string;
  refNo: string;
  issueDate: { year: number; month: number; day: number };
  docContent: string;
}): string => {
  const extOf = (key: string) =>
    ISSUERS.find((i) => i.key === key)?.type === 'svg' ? 'svg' : 'png';
  const authEntries = authorities
    .filter((a) => a.name.trim() !== '')
    .map(
      (a) =>
        `(name: "${m[`prefix_${a.faction}`]()}${a.name}", icon: image("stamp-${a.faction}.${extOf(a.faction)}", width: ${(logoScales[issuer] ?? 1) * 100}%))`
    );
  const watermarkExt = extOf(issuer);
  return `
#import "official-doc.typ": *

#show: official-doc.with(
  ref-no: "${refNo}",
  conf-level: none,
  conf-period: none,
  urgen-level: none,
  authorities: (${authEntries.join(', ')},),
  watermark-icon: image("watermark-${issuer}.${watermarkExt}", width: ${(logoScales[issuer] ?? 1) * 100}%),
  issuer: "${m[`issuer_${issuer}`]()}",
  title: "${docTitle}",
  issue-date: datetime(year: ${year}, month: ${month}, day: ${day}),
  seed: ${Date.now()},
)

${docContent}
`;
};

export default typst;
