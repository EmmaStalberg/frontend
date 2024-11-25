import type { Map, TileLayer } from "leaflet";

// Sets up a Leaflet map on the provided DOM element
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export type LeafletModuleType = typeof import("leaflet");
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export type LeafletDrawModuleType = typeof import("leaflet-draw");

export const setupLeafletMap = async (
  mapElement: HTMLElement
): Promise<[Map, LeafletModuleType, TileLayer]> => {
  if (!mapElement.parentNode) {
    throw new Error("Cannot setup Leaflet map on disconnected element");
  }
  // eslint-disable-next-line
  const Leaflet = (await import("leaflet")).default as LeafletModuleType;
  Leaflet.Icon.Default.imagePath = "/static/images/leaflet/images/";

  const map = Leaflet.map(mapElement);
  const style = document.createElement("link");
  style.setAttribute("href", "/static/images/leaflet/leaflet.css");
  style.setAttribute("rel", "stylesheet");
  mapElement.parentNode.appendChild(style);
  // map.setView([57.7072326, 11.9670171], 13);
  map.locate({ setView: true, maxZoom: 13 });
  map.on("locationfound", (e: L.LocationEvent) => {
    map.setView(e.latlng);
    Leaflet.marker(e.latlng).addTo(map);
  });

  const tileLayer = createTileLayer(Leaflet).addTo(map);

  return [map, Leaflet, tileLayer];
};

export const replaceTileLayer = (
  leaflet: LeafletModuleType,
  map: Map,
  tileLayer: TileLayer
): TileLayer => {
  map.removeLayer(tileLayer);
  tileLayer = createTileLayer(leaflet);
  tileLayer.addTo(map);
  return tileLayer;
};

export const createTileLayer = (leaflet: LeafletModuleType): TileLayer =>
  leaflet.tileLayer(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: "abcd",
    minZoom: 0,
    maxZoom: 20,
  });

export const createCyclOSMTileLayer = (leaflet: LeafletModuleType): TileLayer =>
  leaflet.tileLayer(
    `https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`,
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>  contributors, <a href="https://cyclosm.org/">CyclOSM</a>',
      minZoom: 0,
      maxZoom: 20,
    }
  );

export const createCycleMapTileLayer = (
  leaflet: LeafletModuleType
): TileLayer =>
  leaflet.tileLayer(
    `https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=0a82ca6f08ab4253a9cc6cba516a620a`,
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>  contributors, <a href="https://www.opencyclemap.org/">OpenCycleMap</a>',
      minZoom: 0,
      maxZoom: 20,
    }
  );

export const createTransportMapTileLayer = (
  leaflet: LeafletModuleType
): TileLayer =>
  leaflet.tileLayer(
    `https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=0a82ca6f08ab4253a9cc6cba516a620a`,
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>  contributors, <a href="https://www.opencyclemap.org/">OpenCycleMap</a>',
      minZoom: 0,
      maxZoom: 20,
    }
  );

export const createHotMapTileLayer = (leaflet: LeafletModuleType): TileLayer =>
  leaflet.tileLayer(`https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png`, {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    minZoom: 0,
    maxZoom: 20,
  });