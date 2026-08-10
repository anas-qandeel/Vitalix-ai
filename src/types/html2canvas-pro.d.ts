// تعريف احتياطي بسيط لـ html2canvas-pro تحسباً لعدم توفر تعريفات TypeScript جاهزة معها،
// لتفادي خطأ بناء بسبب strict: true في هذا المشروع. إن كانت المكتبة تأتي بتعريفاتها
// الخاصة فعلياً، هذا الملف لا يسبب أي تعارض (TypeScript يدمج التعريفات المتوافقة).
declare module 'html2canvas-pro' {
  interface Html2CanvasOptions {
    scale?: number;
    windowWidth?: number;
    windowHeight?: number;
    useCORS?: boolean;
    backgroundColor?: string | null;
    [key: string]: unknown;
  }

  function html2canvas(element: HTMLElement, options?: Html2CanvasOptions): Promise<HTMLCanvasElement>;

  export default html2canvas;
}
