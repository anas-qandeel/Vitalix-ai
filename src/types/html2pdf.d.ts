// مكتبة html2pdf.js لا تأتي مع تعريفات TypeScript جاهزة (لا يوجد @types/html2pdf.js رسمي).
// هذا تعريف أساسي كافٍ لاستخدامها بأمان مع strict: true دون أخطاء بناء.
declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: Record<string, unknown>;
  }

  interface Html2PdfInstance {
    set: (options: Html2PdfOptions) => Html2PdfInstance;
    from: (element: HTMLElement) => Html2PdfInstance;
    save: (filename?: string) => Promise<void>;
    toPdf: () => Html2PdfInstance;
    output: (type: string) => Promise<unknown>;
  }

  function html2pdf(): Html2PdfInstance;

  export default html2pdf;
}
