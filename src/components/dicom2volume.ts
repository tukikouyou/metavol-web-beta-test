// 2024/6/9
//
// homework: MyDataSet is dupulicated with DicomView.vue

import { DataSet } from "dicom-parser";
import * as THREE from 'three';
import { Volume } from "./Volume";
import type { VolumeMetadata, Modality } from "../types/VolumeMetadata";
import * as DecompressJpegLossless from "./decompressJpegLossless";

interface MyDataSet extends DataSet {
    decompressed?: ArrayBuffer;
  }

const detectModality = (d: MyDataSet): Modality => {
    const m = (d.string("x00080060") ?? "").toUpperCase();
    if (m === "PT" || m === "PET") return "PT";
    if (m === "CT") return "CT";
    if (m === "MR") return "MR";
    return "OTHER";
}

export const generateVolumeFromDicom = (dcmList: MyDataSet[]) => {


    let suvFactor = 1;
    try{
        suvFactor = getSuvFactor(dcmList) ?? 1;
    }catch{

    }

    const d = dcmList[0];
    const d1 = dcmList[1];

    const nx = d.int16("x00280011")!; // columns
    const ny = d.int16("x00280010")!; // rows
    const nz = dcmList.length;

    const vx = new THREE.Vector3(
        d.floatString("x00200037",0)!, // 	Image Orientation (Patient)
        d.floatString("x00200037",1)!,
        d.floatString("x00200037",2)!
    );
    const px = d.floatString("x00280030",0)!; // pixel spacing
    vx.multiplyScalar(px / vx.length());

    const vy = new THREE.Vector3(
        d.floatString("x00200037",3)!, // 	Image Orientation (Patient)
        d.floatString("x00200037",4)!,
        d.floatString("x00200037",5)!
    );
    const py = d.floatString("x00280030",1)!; // pixel spacing
    vy.multiplyScalar(py / vy.length());

    // slice locationは、たまに、image positionのz座標と符号が反対のことがある。
    // そのため、下記の式は使えない。
    // const sl = d.floatString("x00201041")!; // slice location
    // const sl1 = d1.floatString("x00201041")!; // slice location

    const pos0 = new THREE.Vector3(
        d.floatString("x00200032",0)!, //	Image Position (Patient)
        d.floatString("x00200032",1)!,
        d.floatString("x00200032",2)!
    );

    const pos1 = new THREE.Vector3(
        d1.floatString("x00200032",0)!,
        d1.floatString("x00200032",1)!,
        d1.floatString("x00200032",2)!
    );

    const vz = pos1.clone();
    vz.sub(pos0);

    // let buffer = new ArrayBuffer(nx*ny*nz*4);
    // let dv = new DataView(buffer);

    let vox = new Float32Array(nx*ny*nz);

    let ad = 0;
    for (let i = 0; i<nz; i++){
        const dataSet = dcmList[i];
        const pixelDataElement = dataSet.elements.x7fe00010;
        const intercept = Number(dataSet.string("x00281052") ?? "0");
        const slope = Number(dataSet.string("x00281053") ?? "1");

        // JPEG Lossless 圧縮なら decompress (キャッシュ済みなら再利用)
        if (DecompressJpegLossless.check(dataSet) && dataSet.decompressed == null){
            dataSet.decompressed = DecompressJpegLossless.decode(dataSet);
        }
        const buf = dataSet.decompressed != null
            ? dataSet.decompressed as ArrayBuffer
            : dataSet.byteArray.buffer;
        const offset = dataSet.decompressed != null ? 0 : pixelDataElement.dataOffset;
        const length = dataSet.decompressed != null
            ? (dataSet.decompressed as ArrayBuffer).byteLength
            : pixelDataElement.length;
        const aaa = new Int16Array(buf, offset, length / 2);


        for (let j = 0; j<ny; j++){
            for (let k = 0; k<nx; k++){
                const v = (aaa[j*nx+k] * slope + intercept)*suvFactor;
                vox[ad] = v;
                ad+=1;
            }
        }
    }

    const modality = detectModality(d);
    const metadata: VolumeMetadata = {
        modality,
        seriesUID: d.string("x0020000e") ?? undefined,
        seriesDescription: d.string("x0008103e") ?? undefined,
        suvFactor,
        units: d.string("x00541001") ?? undefined,
        patientWeightKg: d.floatString("x00101030") ?? undefined,
    };
    if (modality === "PT") {
        try {
            const acq = d.string("x00080032");
            if (acq) metadata.acquisitionTimeSec = parseSecond6digits(acq);
            let hl = d.floatString("x00181075");
            if (hl == null && d.elements.x00540016?.items?.[0]?.dataSet) {
                hl = d.elements.x00540016.items[0].dataSet.floatString("x00181075") ?? undefined;
            }
            if (hl != null) metadata.radionuclideHalfLifeSec = hl;
            let dose = d.floatString("x00181074");
            if (dose == null && d.elements.x00540016?.items?.[0]?.dataSet) {
                dose = d.elements.x00540016.items[0].dataSet.floatString("x00181074") ?? undefined;
            }
            if (dose != null) metadata.radionuclideTotalDoseBq = dose;
            let dst = d.string("x00181072");
            if (dst == null && d.elements.x00540016?.items?.[0]?.dataSet) {
                dst = d.elements.x00540016.items[0].dataSet.string("x00181072") ?? undefined;
            }
            if (dst) metadata.doseStartTimeSec = parseSecond6digits(dst);
        } catch {}
    }

    const dicomVolume: Volume = {
        nx: nx,
        ny: ny,
        nz: nz,
        imagePosition: pos0,
        vectorX: vx,
        vectorY: vy,
        vectorZ: vz,
        voxel: vox,
        metadata,
    };

    return dicomVolume;
}




let log:string[] = [];

const getSuvFactor = (dd: MyDataSet[]) => {

    log = [];

    const d = dd[0];
    let constant = 1;
    // let text = "";
    const unit = d.string("x00541001");
    log.push("unit: "+unit);
    const bw = d.floatString("x00101030");
    log.push("bw: " + bw);
    const pf = d.floatString("x70531000");
    log.push("philips factor: " + pf);

    if ((unit!.toLowerCase() == "bq/cc" || unit?.toLowerCase() == "bqml")
        && getCorrectedDosage(dd) != 0 && bw != 0){
            constant = 1.0 / getBqmlPerSuv(dd, bw!);
            log.push("constant "+constant);
    }else if (unit == "CNTS" && pf != null){
        constant = Number(pf);
    }

    console.log(log);

    return constant;
}

const parseSecond6digits = (str:string) => {
    const h = Number(str.substring(0,2));
    const m = Number(str.substring(2,4));
    const s = Number(str.substring(4,6));
    return h*3600+m*60+s;
}

const getCorrectedDosage = (dd: MyDataSet[]) => {
    const d = dd[0];

    let hl = d.floatString("x00181075"); // half life
    if (hl == null){
        hl = d.elements.x00540016.items![0].dataSet!.floatString("x00181075") // ネスト
    }
    log.push("half life "+hl);

    const dc = d.string("x00541102"); // decay correction
    let dosage = d.floatString("x00181074"); // radionuclide total dose
    if (dosage == null){
        dosage = d.elements.x00540016.items![0].dataSet!.floatString("x00181074") // ネスト
    }
    log.push("dosage (uncorrected) "+dosage);

    if (dc!.startsWith("START")){

        //2024/5/13 本来はすべてのDICOMファイルのscanstarttimeを調べてearliestのものを採択すべきである
        const scanstarttime_ = d.string("x00080032");
        log.push("scanstarttime "+scanstarttime_);
        const scanstarttime = parseSecond6digits(scanstarttime_!); // acuisition time

        let dosestarttime_ = d.string("x00181072"); // Radiopharmaceutical Start Time
        if (dosestarttime_ == null){
            dosestarttime_ = d.elements.x00540016.items![0].dataSet!.string("x00181072") // ネスト
        }
        log.push("dosestarttime "+dosestarttime_);
        const dosestarttime = parseSecond6digits(dosestarttime_!)

        dosage! *= Math.pow(0.5, (scanstarttime - dosestarttime) / hl!);
        log.push("dosage (corrected) "+dosage);
    }
    return dosage!;
};

const getBqmlPerSuv = (dd: MyDataSet[], bw:number) => {
    return getCorrectedDosage(dd) / (bw * 1000);
};


