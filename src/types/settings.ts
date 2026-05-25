
export type CoordFormat = 'DMS' | 'UTM';
export type InfoPosition = 'TopLeft' | 'TopRight' | 'BottomLeft' | 'BottomRight';
export type FontSize = 'Small' | 'Medium' | 'Large';

export interface CameraSettings {
  coordFormat: CoordFormat;
  fontSize: FontSize;
  customText: string;
  position: InfoPosition;
  showDateTime: boolean;
}

export const DEFAULT_SETTINGS: CameraSettings = {
  coordFormat: 'DMS',
  fontSize: 'Medium',
  customText: 'BPA - MONITORAMENTO',
  position: 'BottomLeft',
  showDateTime: true,
};
