export interface LogoState {
  file: File | null;
  previewUrl: string | null;
  x: number;
  y: number;
  scale: number;
}

export enum EditMode {
  IDLE = 'IDLE',
  REMOVE_OBJECT = 'REMOVE_OBJECT',
  CHANGE_BACKGROUND = 'CHANGE_BACKGROUND',
  ADD_LOGO = 'ADD_LOGO',
  MAKE_HD = 'MAKE_HD',
}

export interface ProcessingState {
  isProcessing: boolean;
  message: string;
}