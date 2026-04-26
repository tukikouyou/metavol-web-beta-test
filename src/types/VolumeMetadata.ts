export type Modality = "PT" | "CT" | "MR" | "OTHER";

export interface VolumeMetadata {
    modality: Modality;
    seriesUID?: string;
    seriesDescription?: string;

    suvFactor?: number;
    patientWeightKg?: number;
    radionuclideHalfLifeSec?: number;
    radionuclideTotalDoseBq?: number;
    doseStartTimeSec?: number;
    acquisitionTimeSec?: number;
    units?: string;
}
