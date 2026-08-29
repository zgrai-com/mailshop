import { BookOpen, Check, ClipboardCopy, Download, FileText, ListChecks } from "lucide-react";
import { useState } from "react";
import skillMarkdown from "../content/mailshop-batch-import-skill.md?raw";
import referenceMarkdown from "../content/mailshop-batch-import-reference.md?raw";

type Props = {
  onOpenTasks?: () => void;
};

async function copyText(value: string, onCopied: (value: boolean) => void) {
  try {
    await navigator.clipboard.writeText(value);
    onCopied(true);
    window.setTimeout(() => onCopied(false), 1600);
  } catch {
    onCopied(false);
  }
}

function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function DocumentBlock({ value, label, fileName }: { value: string; label: string; fileName: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="batch-guide-document-block">
    <div className="batch-guide-document-toolbar">
      <span><FileText size={14} />{label}</span>
      <div>
        <button className="icon-button" type="button" onClick={() => download(fileName, value)} aria-label={`下载 ${label}`} title={`下载 ${label}`}><Download size={15} /></button>
        <button className="icon-button" type="button" onClick={() => void copyText(value, setCopied)} aria-label={`复制 ${label}`} title={copied ? "已复制" : `复制 ${label}`}>{copied ? <Check size={15} /> : <ClipboardCopy size={15} />}</button>
      </div>
    </div>
    <pre className="batch-guide-document"><code>{value}</code></pre>
  </div>;
}

export function BatchImportGuidePage({ onOpenTasks }: Props) {
  const [skillCopied, setSkillCopied] = useState(false);
  return <section className="batch-guide-view">
    <header className="page-heading batch-guide-heading">
      <div>
        <span>AI HANDOFF</span>
        <h1>批量导入说明</h1>
        <p>给 AI 使用的 Mailshop 批量导入规则，完整内容保留在下方。</p>
      </div>
      <div className="batch-guide-heading-actions">
        <button className="button quiet" type="button" onClick={() => download("SKILL.md", skillMarkdown)}><Download size={16} />下载 SKILL.md</button>
        <button className="button primary" type="button" onClick={() => void copyText(skillMarkdown, setSkillCopied)}>{skillCopied ? <Check size={16} /> : <ClipboardCopy size={16} />}{skillCopied ? "已复制" : "复制 SKILL.md"}</button>
        {onOpenTasks && <button className="button quiet" type="button" onClick={onOpenTasks}><ListChecks size={16} />打开采集任务</button>}
      </div>
    </header>

    <section className="batch-guide-human-note" aria-label="快速说明">
      <strong>人类用户只需要三步</strong>
      <ol>
        <li>只给商品 URL 也可以，或附上已有的标题和图片。</li>
        <li>让 AI 先打开页面，再按下方 <code>SKILL.md</code> 提取并生成 CSV 或 JSON。</li>
        <li>打不开或返回 404 的链接会被单独报告，不会猜测或替换商品。</li>
        <li>回到“采集任务”，点击“批量导入”上传有效文件并检查预览。</li>
      </ol>
      <p>Shopify 页面会优先读取完整商品图集；HTTP 200 的停放页或跳转壳页也会判为不可用，无法确认的数据会留空并报告。</p>
    </section>

    <div className="batch-guide-document-meta"><BookOpen size={15} /><code>SKILL.md</code><span>mailshop-batch-import</span><span>完整原文</span></div>
    <DocumentBlock value={skillMarkdown} label="SKILL.md" fileName="SKILL.md" />

    <details className="batch-guide-reference">
      <summary><span><FileText size={15} /><code>references/import-format.md</code></span><small>字段映射、示例与校验规则</small></summary>
      <DocumentBlock value={referenceMarkdown} label="references/import-format.md" fileName="import-format.md" />
    </details>
  </section>;
}
