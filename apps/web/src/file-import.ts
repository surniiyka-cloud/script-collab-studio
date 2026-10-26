/**
 * Browser-only import. Extracts selectable text, never OCRs scans or uploads
 * the original binary file to a third party. User reviews parsed result.
 */
export async function readScreenplayFile(file:File):Promise<{text:string;warning?:string}> {
 const extension=file.name.toLowerCase().split('.').pop();
 if(!extension||!['txt','fountain','md','docx','pdf'].includes(extension))
  throw Error('Поддерживаются TXT, Fountain, Markdown, DOCX и PDF.');
 const limit=['pdf','docx'].includes(extension)?20*1024*1024:2*1024*1024;
 if(file.size>limit)throw Error('Файл превышает ограничение 20 МБ для документа или 2 МБ для текста.');
 if(extension==='txt'||extension==='fountain'||extension==='md')
  return {text:await file.text()};
 if(extension==='docx'){
  const mammoth=await import('mammoth');
  const extracted=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
  return {text:extracted.value,warning:'Проверьте границы реплик и сцен: форматирование DOCX не переносится автоматически.'};
 }
 // The public package entry exposes the PDF.js TypeScript declarations.
 const pdfjs=await import('pdfjs-dist');
 const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
 pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
 const document=await task.promise;
 if(document.numPages>250)throw Error('В одном документе поддерживается не более 250 страниц.');
 const lines:string[]=[];
 try{
  for(let page=1;page<=document.numPages;page++){
   const content=await (await document.getPage(page)).getTextContent();
   let current='';
   for(const item of content.items){
    if(!('str' in item))continue;
    const value=String(item.str);
    current+=value;
    if(item.hasEOL){lines.push(current);current='';}
   }
   if(current)lines.push(current);
   if(page<document.numPages)lines.push('');
  }
 }finally{await document.destroy();}
 return {text:lines.join('\n'),warning:'PDF извлечён без OCR. Обязательно проверьте порядок сцен, строк и диалогов — сложная вёрстка может нарушить их.'};
}
