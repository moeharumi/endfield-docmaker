import type { TemplateDefinition } from './types';
import type { IssuerKey } from '$lib/types';
import { ISSUERS, getLogoScales, issuerExt } from '$lib/constants';
import { m } from '$lib/paraglide/messages';
import type { KvEntry } from '$lib/components/KvGrid.svelte';

export interface TestpaperValues {
  issuer: IssuerKey;
  titlePrefix: IssuerKey;
  year: string;
  titleSuffix: string;
  subject: string;
  examType: string;
  examDuration: string;
  examInfo: KvEntry[];
  showAnswer: boolean;
  parJustify: boolean;
  showSecret: boolean;
  showScoreBox: boolean;
  docContent: string;
}

const escapeTypst = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const parseYear = (raw: string): number => {
  const n = parseInt(raw, 10);
  return isNaN(n) || n <= 0 ? 2025 : n;
};

export const testpaperTemplate: TemplateDefinition = {
  id: 'testpaper',
  name: () => m.template_testpaper(),
  gridCols: 3,
  storageVersion: 2,
  fields: [
    {
      type: 'select',
      key: 'issuer',
      label: () => m.issuer(),
      placeholder: () => m.select_issuer(),
      options: ISSUERS.map((i) => ({
        value: i.key,
        label: () => m[`issuer_${i.key}`]()
      })),
      colspan: 1
    },
    {
      type: 'number',
      key: 'year',
      label: () => m.testpaper_year(),
      min: 1,
      placeholder: '2025',
      colspan: 1
    },
    {
      type: 'text',
      key: 'subject',
      label: () => m.testpaper_subject(),
      placeholder: () => m.testpaper_subject_placeholder(),
      colspan: 1
    },
    {
      type: 'prefixed-input',
      key: 'titleSuffix',
      prefixKey: 'titlePrefix',
      label: () => m.testpaper_title(),
      prefixes: ISSUERS.map((i) => ({
        value: i.key,
        label: () => m[`prefix_${i.key}`]()
      })),
      placeholder: () => m.testpaper_title_placeholder()
    },
    {
      type: 'text',
      key: 'examType',
      label: () => m.testpaper_exam_type(),
      placeholder: () => 'A',
      colspan: 1
    },
    {
      type: 'text',
      key: 'examDuration',
      label: () => m.testpaper_exam_duration(),
      placeholder: () => '120分钟',
      colspan: 2
    },
    {
      type: 'kv-grid',
      key: 'examInfo',
      label: () => m.testpaper_exam_info()
    },
    {
      type: 'toggle',
      key: 'showAnswer',
      label: () => m.testpaper_show_answer(),
      colspan: 1
    },
    {
      type: 'toggle',
      key: 'parJustify',
      label: () => m.testpaper_par_justify(),
      colspan: 1
    },
    {
      type: 'toggle',
      key: 'showSecret',
      label: () => m.testpaper_show_secret(),
      colspan: 1
    },
    {
      type: 'toggle',
      key: 'showScoreBox',
      label: () => m.testpaper_show_score_box(),
      colspan: 1
    },
    {
      type: 'textarea',
      key: 'docContent',
      label: () => m.testpaper_content(),
      placeholder: () => m.testpaper_content_placeholder(),
      grow: true,
      minHeight: 40
    }
  ],
  defaults: () => ({
    issuer: ISSUERS[0].key as string,
    titlePrefix: ISSUERS[0].key as string,
    year: '2025',
    titleSuffix: '期末考试I卷',
    subject: '数学',
    examType: 'A',
    examDuration: '120分钟',
    examInfo: [{ key: '命题人', value: '张三  李四  王五' }] satisfies KvEntry[],
    showAnswer: false,
    parJustify: true,
    showSecret: true,
    showScoreBox: true,
    docContent: `\
#notice(
  [答题前，请务必将自已的姓名、准考证号用0.5毫米黑色墨水的签字笔填写在试卷及答题卡的规定位置。],
  [请认真核对监考员在答题卡上所粘贴的条形码上的姓名、准考证号与本人是否相符。],
  [作答选择题必须用2B铅笔将答题卡上对应选项的方框涂满、涂黑；如需改动，请用橡皮擦干净后，再选涂其他答案。作答非选择题，必须用0.5毫米黑色墨水的签字笔在答题卡上的指定位置作答，在其他位置作答一律无效。],
)

= 单选题：本题共 8 小题，每小题 5 分，共 40 分。

#question[
  请在此编写题目内容 #paren[A]
  #choices([选项A], [选项B], [选项C], [选项D])
]
`
  }),
  generateTypstSource: (values: Record<string, unknown>) => {
    const v = values as unknown as TestpaperValues;
    const prefix = m[`prefix_${v.titlePrefix as IssuerKey}`]();
    const year = parseYear(v.year);
    const fullTitle = `${year}${prefix}${v.titleSuffix}`;

    const kvEntries = (v.examInfo ?? [])
      .filter((e: KvEntry) => e.key.trim() !== '')
      .map((e: KvEntry) => `${escapeTypst(e.key)}: "${escapeTypst(e.value)}"`)
      .join(', ');

    const watermarkExt = issuerExt(v.issuer);
    const watermarkScale = getLogoScales()[v.issuer] ?? 1;

    const lines: string[] = [
      '#import "@preview/ezexam:0.3.1": *',
      '',
      '#show: setup.with(',
      '  mode: EXAM,',
      '  paper: a3,',
      `  show-answer: ${v.showAnswer ? 'true' : 'false'},`,
      `  par-justify: ${v.parJustify ? 'true' : 'false'},`,
      ')',
      '',
      `#set page(background: place(center + horizon, block(width: 20%, image("watermark-${v.issuer}.${watermarkExt}", width: ${watermarkScale} * 100%))))`,
      '',
      `#chapter[${escapeTypst(fullTitle)}]`,
      `#title[${escapeTypst(fullTitle)}]`,
      `#subject[${escapeTypst(v.subject)}]`
    ];

    if (v.showSecret) {
      lines.push('#secret()');
    }

    if (v.showScoreBox) {
      lines.push('#score-box(y: .5in)');
    }

    if (v.examType.trim()) {
      lines.push(`#exam-type[${escapeTypst(v.examType)}]`);
    }

    if (kvEntries) {
      lines.push(`#exam-info(info: (${kvEntries}))`);
    }

    if (v.examDuration.trim()) {
      lines.push(`#exam-info(info: (考试时长: "${escapeTypst(v.examDuration)}"))`);
    }

    lines.push('', v.docContent);

    return lines.join('\n');
  },
  getFileName: (values: Record<string, unknown>) => {
    const v = values as unknown as TestpaperValues;
    const prefix = m[`prefix_${v.titlePrefix as IssuerKey}`]();
    const year = parseYear(v.year);
    return `${year}${prefix}${v.titleSuffix} ${v.subject}.pdf`;
  }
};
