export type RoofAerialReview = {
  address: string;
  source: 'Google Maps satellite';
  preparedAt: string;
  verifiedAt: string;
};

export type PreparedRoofAerial = {
  address: string;
  formattedAddress: string;
  source: 'Google Maps satellite';
  preparedAt: string;
  zoom: number;
  locationType: string;
  imageDataUrl: string;
};
