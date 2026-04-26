<script setup lang="ts">

// 2024/6/9 
// Kenji Hirata
// important class, responsible for drawing image box.
//


import { ref, onMounted} from 'vue';
import * as THREE from 'three';


const prop = defineProps(["width","height","selected","isEnter"]);

const isEnter = ref(false);

const cv1 = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;

const init = () => {
  if (cv1.value === null) {
    return;
  }
  ctx = cv1.value.getContext("2d", {willReadFrequently: true});
  clear();
}

onMounted(() => {
  init();
});

const show = (ppp: Float32Array | Int16Array, cols: number, rows: number, wc: number, ww: number, intercept: number, slope: number, centerX:number, centerY:number, zoom: number) => {
    drawImageCvZoom(ppp, cols, rows, wc, ww, intercept, slope, centerX, centerY, zoom);
}

const showDirect = (ppp: Float32Array | Int16Array, wc: number, ww: number) => {
    drawImageCvDirect(ppp, wc, ww);
}

const show2 = (ppp: Float32Array, qqq: Float32Array, cols: number, rows: number, wc: number, ww: number, wc2: number, ww2: number, intercept: number, slope: number, centerX:number, centerY:number, zoom: number) => {
    drawImageCv2(ppp, qqq, cols, rows, wc, ww, wc2, ww2, intercept, slope, centerX, centerY, zoom);
}

const showRgb = (ppp: Uint8Array, cols: number, rows: number, centerX:number, centerY:number, zoom: number) => {
    drawImageCvRgb(ppp, cols, rows, centerX, centerY, zoom);
}

const drawImageCvZoom = async function(pix: Float32Array | Int16Array, ny:number, nx:number, wc:number, ww:number, intercept:number, slope:number, shiftX:number, shiftY:number, zoom:number) {
  if (cv1.value === null || ctx === null) return;
  const canvasx = cv1.value.width;
  const canvasy = cv1.value.height;
  const myImageData = ctx.getImageData(0,0,canvasx,canvasy); // メモリーを新たに確保しないので、createImageDataよりも有利だと思う（想像）
  let ad = 0;

  for (let y = 0; y<canvasy; y++){
    for (let x = 0; x<canvasx; x++){
      const x1 = Math.floor((x-canvasx/2)/zoom +nx/2 + shiftX);
      const y1 = Math.floor((y-canvasy/2)/zoom +ny/2 + shiftY);
      if (x1<0 || x1>nx || y1<0 || y1>ny){
        myImageData.data[ad] = 0; //red
        myImageData.data[ad+1] = 0; //green
        myImageData.data[ad+2] = 0; //blue
        ad += 4;
        continue;
      }
      const raw = pix[x1+y1*nx] * slope + intercept;
      let p = (raw-(wc-ww/2)) * (255/ww);
      if (p<0) p=0;
      if (p>255) p=255;
      myImageData.data[ad] = p; //red
      myImageData.data[ad+1] = p; //green
      myImageData.data[ad+2] = p; //blue
      ad += 4;
    }
  }
  ctx.putImageData(myImageData, 0,0,0,0,canvasx, canvasy);
  showTextTopRight("2D");
  showTextBottomLeft(`WC:${wc}/WW:${ww}`);

}

const drawImageCvDirect = async function(pix: Float32Array | Int16Array, wc:number, ww:number) {
  if (cv1.value === null || ctx === null) return;
  const canvasx = cv1.value.width;
  const canvasy = cv1.value.height;
  const myImageData = ctx.getImageData(0,0,canvasx,canvasy); // メモリーを新たに確保しないので、createImageDataよりも有利だと思う（想像）
  let ad = 0;

  for (let y1 = 0; y1<canvasy; y1++){
    for (let x1 = 0; x1<canvasx; x1++){
      const raw = pix[x1+y1*canvasx];
      let p = (raw-(wc-ww/2)) * (255/ww);
      if (p<0) p=0;
      if (p>255) p=255;
      myImageData.data[ad] = p; //red
      myImageData.data[ad+1] = p; //green
      myImageData.data[ad+2] = p; //blue
      ad += 4;
    }
  }
  ctx.putImageData(myImageData, 0,0,0,0,canvasx, canvasy);
}


export interface MaskOverlay {
  mask: Uint16Array;
  // mask は別 Volume 系（PET など）に紐づく。PET 座標での p00/v01/v10 を別途渡す。
  p00: THREE.Vector3;
  v01: THREE.Vector3;
  v10: THREE.Vector3;
  nx: number; ny: number; nz: number;
  labelClut: number[][];
  alpha: number;
}

const drawNiftiSlice = async function(pix: Float32Array | Int16Array,
    nx:number, ny:number, nz:number, wc:number, ww:number,
    p00:THREE.Vector3, v01:THREE.Vector3,v10:THREE.Vector3, clut: number[][],
    overlay?: MaskOverlay) {

      if (cv1.value === null || ctx === null) return;
      const canvasx = cv1.value.width;
      const canvasy = cv1.value.height;
      const myImageData = ctx.getImageData(0,0,canvasx,canvasy); // メモリーを新たに確保しないので、createImageDataよりも有利だと思う（想像）
      let ad = 0;

      for (let i = 0; i<canvasy; i++){
        let v = p00.clone().addScaledVector(v01,i);
        const vm = overlay ? overlay.p00.clone().addScaledVector(overlay.v01, i) : null;
        for (let j = 0; j<canvasx; j++){

          const v0 = v.clone().floor();
          if (v0.x>=0 && v0.x<nx && v0.y>=0 && v0.y<ny && v0.z>=0 && v0.z<nz){
            const raw = pix[ny*nx*v0.z+nx*v0.y+v0.x];
            let p = Math.floor((raw-(wc-ww/2)) * (255/ww));
            if (p<0) p=0;
            if (p>255) p=255;
            myImageData.data[ad] = clut[p][0]; //red
            myImageData.data[ad+1] = clut[p][1]; //green
            myImageData.data[ad+2] = clut[p][2]; //blue
          }else{
            myImageData.data[ad] = clut[0][0];
            myImageData.data[ad+1] = clut[0][1];
            myImageData.data[ad+2] = clut[0][2];
          }

          if (overlay && vm){
            const mx = Math.floor(vm.x), my = Math.floor(vm.y), mz = Math.floor(vm.z);
            if (mx>=0 && mx<overlay.nx && my>=0 && my<overlay.ny && mz>=0 && mz<overlay.nz){
              const lid = overlay.mask[overlay.ny*overlay.nx*mz + overlay.nx*my + mx];
              if (lid > 0){
                const c = overlay.labelClut[lid % overlay.labelClut.length];
                const a = overlay.alpha;
                myImageData.data[ad]   = myImageData.data[ad]   * (1-a) + c[0]*a;
                myImageData.data[ad+1] = myImageData.data[ad+1] * (1-a) + c[1]*a;
                myImageData.data[ad+2] = myImageData.data[ad+2] * (1-a) + c[2]*a;
              }
            }
            vm.add(overlay.v10);
          }

          ad += 4;
          v.add(v10);
        }
      }

  ctx.putImageData(myImageData, 0,0,0,0,canvasx, canvasy);
  showTextTopRight("3D");
}

const drawNiftiSliceFusion = async function(pix0: Float32Array | Int16Array,
    nx0:number, ny0:number, nz0:number, wc0:number, ww0:number,
    p00_0:THREE.Vector3, v01_0:THREE.Vector3,v10_0:THREE.Vector3, clut0: number[][],
    pix1: Float32Array | Int16Array,
    nx1:number, ny1:number, nz1:number, wc1:number, ww1:number,
    p00_1:THREE.Vector3, v01_1:THREE.Vector3,v10_1:THREE.Vector3, clut1: number[][],
    overlay?: MaskOverlay,
  ) {

      if (cv1.value === null || ctx === null) return;
      const canvasx = cv1.value.width;
      const canvasy = cv1.value.height;
      const myImageData = ctx.getImageData(0,0,canvasx,canvasy); // メモリーを新たに確保しないので、createImageDataよりも有利だと思う（想像）
      let ad = 0;

      for (let i = 0; i<canvasy; i++){
        let v_0 = p00_0.clone().addScaledVector(v01_0,i);
        let v_1 = p00_1.clone().addScaledVector(v01_1,i);
        const vm = overlay ? overlay.p00.clone().addScaledVector(overlay.v01, i) : null;
        for (let j = 0; j<canvasx; j++){

          const v0_0 = v_0.clone().floor();
          const v0_1 = v_1.clone().floor();

          if (v0_0.x >= 0 && v0_0.x < nx0 && v0_0.y >= 0 && v0_0.y < ny0 && v0_0.z >= 0 && v0_0.z < nz0){
            const raw = pix0[ny0*nx0*v0_0.z+nx0*v0_0.y+v0_0.x];
            let p = Math.floor((raw-(wc0-ww0/2)) * (255/ww0));
            if (p<0) p=0;
            if (p>255) p=255;
            myImageData.data[ad] = clut0[p][0] * 0.5; //red
            myImageData.data[ad+1] = clut0[p][1] * 0.5; //green
            myImageData.data[ad+2] = clut0[p][2] * 0.5; //blue
          }else{
            myImageData.data[ad] = clut0[0][0] * 0.5;
            myImageData.data[ad+1] = clut0[0][1] * 0.5;
            myImageData.data[ad+2] = clut0[0][2] * 0.5;
          }

          if (v0_1.x >= 0 && v0_1.x < nx1 && v0_1.y >= 0 && v0_1.y < ny1 && v0_1.z >= 0 && v0_1.z < nz1){
            const raw = pix1[ny1*nx1*v0_1.z+nx1*v0_1.y+v0_1.x];
            let p = Math.floor((raw-(wc1-ww1/2)) * (255/ww1));
            if (p<0) p=0;
            if (p>255) p=255;
            myImageData.data[ad] += clut1[p][0] * 0.5; //red
            myImageData.data[ad+1] += clut1[p][1] * 0.5; //green
            myImageData.data[ad+2] += clut1[p][2] * 0.5; //blue
          }else{
            myImageData.data[ad] += clut1[0][0] * 0.5;
            myImageData.data[ad+1] += clut1[0][1] * 0.5;
            myImageData.data[ad+2] += clut1[0][2] * 0.5;
          }

          if (overlay && vm){
            const mx = Math.floor(vm.x), my = Math.floor(vm.y), mz = Math.floor(vm.z);
            if (mx>=0 && mx<overlay.nx && my>=0 && my<overlay.ny && mz>=0 && mz<overlay.nz){
              const lid = overlay.mask[overlay.ny*overlay.nx*mz + overlay.nx*my + mx];
              if (lid > 0){
                const c = overlay.labelClut[lid % overlay.labelClut.length];
                const a = overlay.alpha;
                myImageData.data[ad]   = myImageData.data[ad]   * (1-a) + c[0]*a;
                myImageData.data[ad+1] = myImageData.data[ad+1] * (1-a) + c[1]*a;
                myImageData.data[ad+2] = myImageData.data[ad+2] * (1-a) + c[2]*a;
              }
            }
            vm.add(overlay.v10);
          }

          ad += 4;
          v_0.add(v10_0);
          v_1.add(v10_1);
        }
      }

  ctx.putImageData(myImageData, 0,0,0,0,canvasx, canvasy);
  showTextTopRight("Fused");
}

// let mipDataSet: Float32Array[] = new Float32Array[];

const drawNiftiMip = async function(pix: Float32Array | Int16Array,
    nx:number, ny:number, nz:number, wc:number, ww:number,
    p00:THREE.Vector3, v01:THREE.Vector3,v10:THREE.Vector3,
    angle:number, thresh:number, depth:number, clut: number[][], isSurface: boolean,
    overlay?: MaskOverlay) {

      const time0 = performance.now();

      if (cv1.value === null || ctx === null) return;
      const canvasx = cv1.value.width;
      const canvasy = cv1.value.height;
      const myImageData = ctx.getImageData(0,0,canvasx,canvasy);
      let ad = 0;

      let mipData = new Float32Array(ny*nz);
      let mipMaskData: Uint16Array | null = null;
      if (overlay && overlay.mask){
        // overlay は PET 格子と同じ次元・affine の前提（MIP 元 PET と一致）
        mipMaskData = new Uint16Array(ny*nz);
      }

      const s = Math.sin((angle-90) *3.1415926535 / 180);
      const c = Math.cos((angle-90) *3.1415926535 / 180);

      // const isSurface = true;
      // const thresh = 0.5;
      // const depth = 3;

      const time1 = performance.now();


      if (!isSurface){
        for (let k = 0; k<nz; k++){
          for (let j = 0; j<ny; j++){
            let m = -Infinity;
            let lid = 0;
            const j0 = j - ny/2;
            for (let i=nx-1; i>=0; i--){
              const i0 = i - nx/2;
              const x = Math.floor(i0*c-j0*s)+nx/2;
              const y = Math.floor(i0*s+j0*c)+ny/2;
              if (x >= 0 && x < nx && y >= 0 && y < ny) {
                const idx = k*nx*ny + y*nx + x;
                const a = pix[idx];
                if (m < a){
                  m = a;
                }
                if (mipMaskData){
                  const v = overlay!.mask[idx];
                  if (v > lid) lid = v;
                }
              }
            }
            mipData[k*ny+j] = m;
            if (mipMaskData) mipMaskData[k*ny+j] = lid;
          }
        }
      }else{
        for (let k = 0; k<nz; k++){
          for (let j = 0; j<ny; j++){
            let m = -Infinity;
            let lid = 0;
            const j0 = j - ny/2;
            for (let i=nx-1; i>=0; i--){
              const i0 = i - nx/2;
              const x = Math.floor(i0*c-j0*s)+nx/2;
              const y = Math.floor(i0*s+j0*c)+ny/2;
              if (x >= 0 && x < nx && y >= 0 && y < ny) {
                const a = pix[k*nx*ny + y*nx + x];
                if (a<thresh) continue;

                for (let d = 0; d<depth; d++){
                  const id0 = (i-d) - nx/2;
                  const x1 = Math.floor(id0*c-j0*s)+nx/2;
                  const y1 = Math.floor(id0*s+j0*c)+ny/2;
                  const idx1 = k*nx*ny + y1*nx + x1;
                  const a = pix[idx1];
                  if (m < a){
                    m = a;
                  }
                  if (mipMaskData){
                    const v = overlay!.mask[idx1];
                    if (v > lid) lid = v;
                  }
                }
                i=0;
              }
            }
            mipData[k*ny+j] = m;
            if (mipMaskData) mipMaskData[k*ny+j] = lid;
          }
        }
      }

    // }

      const time2 = performance.now();

      for (let i = 0; i<canvasy; i++){
        let v = p00.clone().addScaledVector(v01,i);
        for (let j = 0; j<canvasx; j++){

          const v0 = v.clone().floor();
          if (v0.x>=0 && v0.x<nx && v0.y>=0 && v0.y<ny && v0.z>=0 && v0.z<nz){
            const raw = mipData[nx*v0.z+v0.x];
            let p = Math.floor((raw-(wc-ww/2)) * (255/ww));
            if (p<0) p=0;
            if (p>255) p=255;
            myImageData.data[ad] = clut[p][0];
            myImageData.data[ad+1] = clut[p][1];
            myImageData.data[ad+2] = clut[p][2];

            if (mipMaskData && overlay){
              // ny/nz と vy/vz は drawNiftiMip 呼び側で「画面の y= mip の z 軸」「画面 x= mip の x 軸」のとき有効
              // mipData は [k*ny + j] = [z*ny + y] 形式で格納されているため、
              // ここでは v0.z をスライス（mip 出力の z 軸）、v0.x を画面 x にマッピングして使う。
              // 画面の y が ny 軸対応のため index は mipData と同じ [v0.z, v0.x] 順。
              const lid = mipMaskData[nx*v0.z+v0.x];
              if (lid > 0){
                const cc = overlay.labelClut[lid % overlay.labelClut.length];
                const a = overlay.alpha;
                myImageData.data[ad]   = myImageData.data[ad]   * (1-a) + cc[0]*a;
                myImageData.data[ad+1] = myImageData.data[ad+1] * (1-a) + cc[1]*a;
                myImageData.data[ad+2] = myImageData.data[ad+2] * (1-a) + cc[2]*a;
              }
            }
          }else{
            myImageData.data[ad] = clut[0][0];
            myImageData.data[ad+1] = clut[0][1];
            myImageData.data[ad+2] = clut[0][2];
          }
          ad += 4;
          v.add(v10);
        }
      }

      const time3 = performance.now();

  ctx.putImageData(myImageData, 0,0,0,0,canvasx, canvasy);
  const time4 = performance.now();
  // console.log(time1-time0, time2-time1, time3-time2, time4-time3);

  if (isSurface){
    showTextTopRight("sMIP");
  }else{
    showTextTopRight("MIP");
  }


}




// const drawImageCv1 = async function(pix: Float32Array | Int16Array, ny:number, nx:number, wc:number, ww:number, intercept:number, slope:number) {
//   if (cv1.value === null || ctx === null) return;
  
//   const myImageData = ctx.getImageData(0,0,nx,ny); // メモリーを新たに確保しないので、createImageDataよりも有利だと思う（想像）
//   let ad = 0;

//   for (let y = 0; y<ny; y++){
//     for (let x = 0; x<nx; x++){
//       const raw = pix[x+y*nx] * slope + intercept;
//       let p = (raw-(wc-ww/2)) * (255/ww);

//       if (p<0) p=0;
//       if (p>255) p=255;

//       myImageData.data[ad] = p; //red
//       myImageData.data[ad+1] = p; //green
//       myImageData.data[ad+2] = p; //blue
//       ad += 4;
//     }
//   }

//   const ibm = await window.createImageBitmap(myImageData, 0,0, nx, ny); // awaitにするのがポイントだった
 
//   if (nx==512 && ny==512){
//     ctx.putImageData(myImageData, 0,0,0,0,cv1.value.width, cv1.value.height);
//   }else{
//     const zoom = 512/nx;
//     ctx.scale(zoom, zoom);
//     ctx.drawImage(ibm, 0,0);
//     ctx.scale(1/zoom, 1/zoom); //これをしないと毎回どんどん拡大されていく。
//   }
// }

const drawImageCv2 = async function(pix: Float32Array, pix2:Float32Array,
 ny:number, nx:number, wc:number, ww:number, wc2:number, ww2:number,
  intercept:number, slope:number, shiftX:number, shiftY:number, zoom:number) {

    if (cv1.value === null || ctx === null) return;
    const canvasx = cv1.value.width;
    const canvasy = cv1.value.height;

    const myImageData = ctx.getImageData(0,0,canvasx,canvasy); // メモリーを新たに確保しないので、createImageDataよりも有利だと思う（想像）
    let ad = 0;

  for (let y = 0; y<canvasy; y++){
    for (let x = 0; x<canvasx; x++){
      const x1 = Math.floor((x-canvasx/2)/zoom +nx/2 + shiftX);
      const y1 = Math.floor((y-canvasy/2)/zoom +ny/2 + shiftY);

      if (x1<0 || x1>nx || y1<0 || y1>ny){
        myImageData.data[ad] = 0; //red
        myImageData.data[ad+1] = 0; //green
        myImageData.data[ad+2] = 0; //blue
        ad += 4;
        continue;
      }

      const ad_p = x1+y1*nx;
      const raw = pix[ad_p] * slope + intercept;
      let p = (raw-(wc-ww/2)) * (255/ww);
      const raw2 = pix2[ad_p] * slope + intercept;
      let q = (raw2-(wc2-ww2/2)) * (255/ww2);
      
      if (p<0) p=0;
      if (p>255) p=255;

      if (q>0){
        myImageData.data[ad] = 255; //red
        myImageData.data[ad+1] = p; //green
        myImageData.data[ad+2] = p; //blue

      }else{
        myImageData.data[ad] = p; //red
        myImageData.data[ad+1] = p; //green
        myImageData.data[ad+2] = p; //blue
      }
      ad += 4;
    }
  }

  const ibm = await window.createImageBitmap(myImageData, 0,0, nx, ny); // awaitにするのがポイントだった
 


  if (nx==512 && ny==512){
    ctx.putImageData(myImageData, 0,0,0,0,cv1.value.width, cv1.value.height);
  }else{
    const zoom = 512/nx;
    ctx.scale(zoom, zoom);
    ctx.drawImage(ibm, 0,0);
    ctx.scale(1/zoom, 1/zoom); //これをしないと毎回どんどん拡大されていく。
  }
}

const drawImageCvRgb = async function(pix:Uint8Array, ny:number, nx:number, shiftX:number, shiftY:number, zoom:number) {

  if (cv1.value === null || ctx === null) return;
  const canvasx = cv1.value.width;
  const canvasy = cv1.value.height;
  const myImageData = ctx.getImageData(0,0,canvasx,canvasy); // メモリーを新たに確保しないので、createImageDataよりも有利だと思う（想像）
  let ad = 0;

  for (let y = 0; y<canvasy; y++){
    for (let x = 0; x<canvasx; x++){
      const x1 = Math.floor((x-canvasx/2)/zoom +nx/2 + shiftX);
      const y1 = Math.floor((y-canvasy/2)/zoom +ny/2 + shiftY);
      if (x1<0 || x1>nx || y1<0 || y1>ny){
        myImageData.data[ad] = 0; //red
        myImageData.data[ad+1] = 0; //green
        myImageData.data[ad+2] = 0; //blue
        ad += 4;
        continue;
      }

      const ad_p = (x1+y1*nx)*3;
      myImageData.data[ad] = pix[ad_p]; //red
      myImageData.data[ad+1] = pix[ad_p+1]; //green
      myImageData.data[ad+2] = pix[ad_p+2]; //blue
      ad += 4;
    }
  }
  ctx.putImageData(myImageData, 0,0,0,0,canvasx, canvasy);
  showTextTopRight("RGB");
}


const clear = (text = "No image") => {

  if (cv1.value === null || ctx === null) return;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0,0,cv1.value.width, cv1.value.height);

  ctx.font = "48px Arial";
  ctx.fillStyle = "#660505";
  ctx.fillText(text,20,50);
}

const showTextTopRight = (text: string) => {
  if (cv1.value === null || ctx === null) return;
  ctx.font = "18px Arial";
  ctx.fillStyle = "#66aa44";
  const mes = ctx.measureText(text);
  
  ctx.fillText(text, cv1.value.width-mes.width, mes.fontBoundingBoxAscent);
}

const showTextBottomLeft = (text: string) => {
  if (cv1.value === null || ctx === null) return;
  ctx.font = "18px Arial";
  ctx.fillStyle = "#66aa44";
  const mes = ctx.measureText(text);
  
  ctx.fillText(text, 0, cv1.value.height - mes.fontBoundingBoxDescent );
}


const drawSphereOverlay = (cx: number, cy: number, radiusPx: number) => {
  if (cv1.value === null || ctx === null) return;
  if (radiusPx <= 0 || !isFinite(radiusPx)) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffd24a";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd24a";
  ctx.fill();
  ctx.restore();
};

const drawPolygonOverlay = (vertices: Array<[number, number]>, mode: 'add' | 'erase', closed: boolean) => {
  if (cv1.value === null || ctx === null) return;
  if (vertices.length === 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(vertices[0][0], vertices[0][1]);
  for (let i = 1; i < vertices.length; i++){
    ctx.lineTo(vertices[i][0], vertices[i][1]);
  }
  if (closed) ctx.closePath();
  ctx.strokeStyle = mode === 'add' ? "#7fff7f" : "#ff7f7f";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = mode === 'add' ? "rgba(127,255,127,0.9)" : "rgba(255,127,127,0.9)";
  for (const [x, y] of vertices){
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

defineExpose({init, show, show2, showRgb, showDirect,
   drawNiftiSlice, drawNiftiSliceFusion, drawNiftiMip, clear,
   drawSphereOverlay, drawPolygonOverlay});

</script>


<template>
    <div class = "drop_area"
        @dragover.prevent
        :class="{enter: isEnter}">
        <span>
            <canvas ref="cv1" :width="prop.width" :height="prop.height"
             :class="[prop.selected ? 'selectedStyle' : 'unselectedStyle', prop.isEnter ? 'isEnter' : '']">
            </canvas>
        </span>
    </div>

</template>

<style scoped>

.unselectedStyle{
  border: 3px solid #444 
}

.selectedStyle{
  border: 3px solid #a44
}

.isEnter{
  border: 3px solid #4a4
}

</style>
