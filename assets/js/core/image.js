/**
 * ============================================================
 * image.js — Redimensionamento de imagens antes de salvar
 * ============================================================
 * As capas são salvas como texto base64 dentro do documento do
 * Firestore. Cada documento aceita no máximo 1 MB, e o base64 deixa
 * o arquivo cerca de 33% maior. Por isso toda imagem é reduzida
 * antes de salvar.
 *
 * Correções em relação ao código antigo:
 * - O "Adicionar" esticava a imagem para 300×200 (distorcia a capa).
 *   Agora a imagem é RECORTADA no centro, sem deformar ("object-fit: cover").
 * - O "Editar" não redimensionava nada: uma capa grande estourava o
 *   limite de 1 MB e o salvamento falhava. Agora os dois usam esta função.
 */

/** Tamanho padrão da capa: vertical, proporção 2:3 (padrão de pôster). */
export const COVER_SIZE = { width: 400, height: 600 };

/** Tamanho da foto de perfil (quadrada). */
export const AVATAR_SIZE = { width: 256, height: 256 };

/** Abre um File/Blob como <img> carregada. */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Recorta e redimensiona uma imagem para o tamanho pedido e devolve
 * um data URL JPEG (texto base64), pronto para salvar no Firestore.
 *
 * @param {File} file   imagem escolhida pelo usuário
 * @param {{width:number,height:number}} size  tamanho final
 * @param {number} quality  qualidade do JPEG (0 a 1)
 */
export async function fileToResizedDataURL(file, size = COVER_SIZE, quality = 0.82) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Arquivo não é uma imagem.');
  }
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');

  // Calcula o recorte central que preenche o destino sem distorcer.
  const scale = Math.max(size.width / img.naturalWidth, size.height / img.naturalHeight);
  const cropW = size.width / scale;
  const cropH = size.height / scale;
  const sx = (img.naturalWidth - cropW) / 2;
  const sy = (img.naturalHeight - cropH) / 2;

  // Fundo escuro para PNGs com transparência (o JPEG não tem alfa).
  ctx.fillStyle = '#111318';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, size.width, size.height);

  return canvas.toDataURL('image/jpeg', quality);
}
