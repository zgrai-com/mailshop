import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileUp,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type {
  CollectionTaskBatchItem,
  CollectionTaskBatchResponse,
} from "../types";
import {
  batchImportCsvTemplate,
  batchImportJsonTemplate,
  parseBatchImportFile,
  type BatchImportRow,
} from "../batch-import";

type Props = {
  onSubmit: (items: CollectionTaskBatchItem[]) => Promise<CollectionTaskBatchResponse>;
};

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function BatchCollectionTaskImport({ onSubmit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<BatchImportRow[]>([]);
  const [fileError, setFileError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CollectionTaskBatchResponse | null>(null);

  const validRows = useMemo(() => rows.filter((row) => row.item).map((row) => row.item as CollectionTaskBatchItem), [rows]);
  const invalidCount = rows.length - validRows.length;
  const batchTooLarge = validRows.length > 100;

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setFileError("");
    setResult(null);
    try {
      const nextRows = await parseBatchImportFile(file);
      setRows(nextRows);
      if (!nextRows.length) setFileError("文件中没有商品行");
    } catch (error) {
      setRows([]);
      setFileError(error instanceof Error ? error.message : "文件解析失败");
    }
  }

  async function submit() {
    if (!validRows.length || batchTooLarge || submitting) return;
    setSubmitting(true);
    try {
      const response = await onSubmit(validRows);
      setResult(response);
      if (response.results?.some((item) => item.status === "failed")) {
        let validIndex = 0;
        setRows((current) => current.map((row) => {
          if (!row.item) return row;
          const itemResult = response.results.find((candidate) => candidate.index === validIndex);
          validIndex += 1;
          if (!itemResult?.error) return row;
          return { ...row, errors: [...row.errors, itemResult.error.message], item: null };
        }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="batch-import-root">
    <button className="button primary compact batch-import-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <FileUp size={16} />批量导入
    </button>
    {open && <section className="batch-import-panel" aria-label="批量导入采集任务">
      <header className="batch-import-header">
        <div><span>FILE IMPORT</span><strong>批量导入采集任务</strong><small>支持 CSV 或 JSON；每行至少需要商品标题、商品 URL 和一张图片。</small></div>
        <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="关闭批量导入" title="关闭"><X size={17} /></button>
      </header>
      <div className="batch-import-toolbar">
        <button className="button quiet compact" type="button" onClick={() => inputRef.current?.click()}><Upload size={15} />选择文件</button>
        <input ref={inputRef} className="batch-import-file-input" type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
        <button className="button quiet compact" type="button" onClick={() => download("mailshop-collection-tasks-template.csv", batchImportCsvTemplate, "text/csv;charset=utf-8") }><Download size={15} />下载 CSV 模板</button>
        <button className="button quiet compact" type="button" onClick={() => download("mailshop-collection-tasks-template.json", batchImportJsonTemplate, "application/json;charset=utf-8") }><Download size={15} />下载 JSON 模板</button>
        {fileName && <span className="batch-import-file-name">{fileName}</span>}
      </div>
      {fileError && <p className="batch-import-error"><AlertCircle size={15} />{fileError}</p>}
      {rows.length > 0 && <>
        <div className="batch-import-summary"><span>共 {rows.length} 行</span><span className="valid">可提交 {validRows.length}</span>{invalidCount > 0 && <span className="invalid">需修正 {invalidCount}</span>}{result?.failed ? <span className="invalid">重复或失败 {result.failed} 行</span> : null}</div>
        <div className="batch-import-preview"><table><thead><tr><th>行</th><th>商品标题</th><th>商品 URL</th><th>图片</th><th>状态</th></tr></thead><tbody>{rows.slice(0, 100).map((row) => <tr key={row.line}><td>{row.line}</td><td title={row.title}>{row.title || "-"}</td><td title={row.productUrl}>{row.productUrl || "-"}</td><td>{row.item?.images.length ?? 0}</td><td>{row.errors.length ? <span className="invalid"><AlertCircle size={14} />{row.errors[0]}</span> : <span className="valid"><CheckCircle2 size={14} />可提交</span>}</td></tr>)}</tbody></table></div>
        {rows.length > 100 && <small className="batch-import-limit">预览最多显示 100 行。</small>}
        {batchTooLarge && <p className="batch-import-error"><AlertCircle size={15} />有效商品超过单批 100 行，请拆分文件后再导入。</p>}
        <footer className="batch-import-footer"><span>{result ? `已创建 ${result.created}，${result.failed ? `重复或失败 ${result.failed}` : "全部成功"}` : "提交后会自动刷新任务列表"}</span><button className="button primary compact" type="button" onClick={() => void submit()} disabled={!validRows.length || batchTooLarge || submitting}>{submitting ? <LoaderCircle className="spin" size={15} /> : <FileUp size={15} />}{submitting ? "提交中" : batchTooLarge ? "请拆分文件" : `提交 ${validRows.length} 条`}</button></footer>
      </>}
    </section>}
  </div>;
}
