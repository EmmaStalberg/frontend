import { isToday } from "date-fns";
import type {
  Circle,
  CircleMarker,
  LatLngExpression,
  LatLngTuple,
  Marker,
  Polyline,
  Map,
} from "leaflet";
// eslint-disable-next-line import/no-duplicates
import { TileLayer } from "leaflet";
import type { CSSResultGroup, PropertyValues } from "lit";
import { ReactiveElement, css } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatDateTime } from "../../common/datetime/format_date_time";
import {
  formatTimeWeekday,
  formatTimeWithSeconds,
} from "../../common/datetime/format_time";
import type { LeafletModuleType } from "../../common/dom/setup-leaflet-map";
import {
  setupOSMMap,
  createCyclOSMTileLayer,
  createTileLayer,
  createCycleMapTileLayer,
  createTransportMapTileLayer,
  createHotMapTileLayer,
} from "../../common/dom/setup-leaflet-map";
import { computeStateDomain } from "../../common/entity/compute_state_domain";
import { computeStateName } from "../../common/entity/compute_state_name";
import type { HomeAssistant, ThemeMode } from "../../types";
import { isTouch } from "../../util/is_touch";
import "../ha-icon-button";
import "../search-input";
import "./ha-entity-marker";
import type { OpenStreetMapPlace } from "../../data/openstreetmap";
import { reverseGeocode } from "../../data/openstreetmap";
import { showAlertDialog } from "../../panels/lovelace/custom-card-helpers";
import { showToast } from "../../util/toast";
import { showAddNoteDialog } from "../../dialogs/map-layer/show-add-note";

// Utility function to extract the entity ID
const getEntityId = (entity: string | HaMapEntity): string =>
  typeof entity === "string" ? entity : entity.entity_id;

export interface HaMapPathPoint {
  point: LatLngTuple;
  timestamp: Date;
}
export interface HaMapPaths {
  points: HaMapPathPoint[];
  color?: string;
  name?: string;
  gradualOpacity?: number;
  fullDatetime?: boolean;
}

export interface HaMapEntity {
  entity_id: string;
  color: string;
  label_mode?: "name" | "state";
  name?: string;
  focus?: boolean;
}

@customElement("ha-osm")
export class HaOSM extends ReactiveElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entities?: string[] | HaMapEntity[];

  @property({ attribute: false }) public paths?: HaMapPaths[];

  @property({ attribute: false }) public layer?: TileLayer;

  @property({ type: Boolean }) public autoFit = false;

  @property({ type: Boolean }) public renderPassive = false;

  @property({ type: Boolean }) public interactiveZones = false;

  @property({ type: Boolean }) public fitZones = false;

  @property({ attribute: "theme-mode", type: String })
  public themeMode: ThemeMode = "auto";

  @property({ type: Number }) public zoom = 13;

  @state() private _loaded = false;

  public leafletMap?: Map;

  private Leaflet?: LeafletModuleType;

  private _resizeObserver?: ResizeObserver;

  private _mapItems: Array<Marker | Circle> = [];

  private _mapFocusItems: Array<Marker | Circle> = [];

  private _mapZones: Array<Marker | Circle> = [];

  private _mapFocusZones: Array<Marker | Circle> = [];

  private _mapPaths: Array<Polyline | CircleMarker> = [];

  private markers: L.Marker[] = [];

  private _routeLayer: L.GeoJSON | null = null;

  private noteMarkers: L.Marker[] = [];

  // Disable type checking for Map
  // @ts-ignore
  private noteData: Map<L.Marker, string> = new Map();

  @state()
  private _location: [number, number] = [57.7072326, 11.9670171];

  @state() private _places?: OpenStreetMapPlace[] | null;

  /**
   * Called when the component is connected to the DOM. Initializes the map and sets up an observer.
   */
  public connectedCallback(): void {
    super.connectedCallback();
    this._loadMap();
    this._attachObserver();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = undefined;
      this.Leaflet = undefined;
    }

    this._loaded = false;

    if (this._resizeObserver) {
      this._resizeObserver.unobserve(this);
    }
  }

  protected update(changedProps: PropertyValues) {
    super.update(changedProps);
  }

  private get _darkMode() {
    return (
      this.themeMode === "dark" ||
      (this.themeMode === "auto" && Boolean(this.hass.themes.darkMode))
    );
  }

  private _loading = false;

  /**
   * Loads the map and initializes the Leaflet map and tile layer.
   */
  private async _loadMap(): Promise<void> {
    if (this._loading) return;
    let map = this.shadowRoot!.getElementById("map");
    if (!map) {
      map = document.createElement("div");
      map.id = "map";
      this.shadowRoot!.append(map);
    }
    this._loading = true;
    try {
      [this.leafletMap, this.Leaflet, this.layer] = await setupOSMMap(map);
      this._findCurrentLocation();
      this._loaded = true;
    } finally {
      this._loading = false;
    }
  }

  /**
   * Finds the current location of the user and places a marker on the map.
   */
  private _findCurrentLocation(): void {
    const map = this.leafletMap;
    const leaflet = this.Leaflet;
    if (!map || !leaflet) return;
    map.off("locationfound");
    map.locate({ setView: true, maxZoom: 13 });
    map.on("locationfound", (e: L.LocationEvent) => {
      this._location = [Number(e.latlng.lat), Number(e.latlng.lng)];
      // this.markers.forEach((marker) => marker.remove());
      // this.markers = [];
      const newMarker = leaflet.marker(e.latlng).addTo(map);
      this.markers.push(newMarker);
      map.setView(e.latlng);
    });
  }

  /**
   * Reverse geocodes the current location to fetch place information.
   */
  private async _reverseGeocode() {
    if (!this._location) {
      return;
    }
    this._places = null;
    const reverse = await reverseGeocode(this._location, this.hass);
    this._places = [reverse];
  }

  /**
   * Fits the map bounds to the given focus items or zones.
   * @param options Optional parameters to adjust zoom level and padding.
   */
  public fitMap(options?: { zoom?: number; pad?: number }): void {
    if (!this.leafletMap || !this.Leaflet || !this.hass) {
      return;
    }
    if (!this._mapFocusItems.length && !this._mapFocusZones.length) {
      const map = this.leafletMap;
      if (!map) return;
      // Re-trigger location detection
      map.locate({ setView: true, maxZoom: 13 });
      return;
    }

    let bounds = this.Leaflet.latLngBounds(
      this._mapFocusItems
        ? this._mapFocusItems.map((item) => item.getLatLng())
        : []
    );

    this._mapFocusZones?.forEach((zone) => {
      bounds.extend("getBounds" in zone ? zone.getBounds() : zone.getLatLng());
    });

    bounds = bounds.pad(options?.pad ?? 0.5);

    this.leafletMap.fitBounds(bounds, { maxZoom: options?.zoom || this.zoom });
  }

  /**
   * Fits the map to a specific set of coordinates.
   * @param coordinates The latitude and longitude of the coordinates.
   * @param options Optional parameters to adjust zoom level and padding.
   */
  // Note! This works for one pair of coordinates. If one want to later make
  // this work for several coordinates at once, it needs to be updated similar to fitMap
  public fitMapToCoordinates(
    coordinates: LatLngTuple,
    options?: { zoom?: number; pad?: number }
  ): void {
    if (!this.leafletMap || !this.Leaflet || !this.hass) {
      return;
    }

    const [lat, lon] = coordinates;

    this.leafletMap.setView(
      new this.Leaflet.LatLng(lat, lon),
      options?.zoom || this.zoom
    );

    // Clear previoud markers
    this._clearRouteLayer();
    const foundAddress = this.Leaflet.marker([lat, lon]).addTo(this.leafletMap);
    this.markers.push(foundAddress);
  }

  /**
   * Fetches JSON data from a given API URL.
   * @param url The URL to fetch data from.
   * @returns The fetched JSON data.
   */
  async fetchApiJson(url: string): Promise<any> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const jsonData = await response.json();
    return jsonData;
  }

  /**
   * Fetches address infromation for a given search term
   * @param searchterm The address or place to search for.
   * @returns The address data if found, otherwise null
   */
  private async _fetchAdressInfo(searchterm: string): Promise<any> {
    try {
      const data = await this.fetchApiJson(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchterm)}&format=json&polygon=1&addressdetails=1`
      );
      if (!data || data.length === 0) {
        showAlertDialog(this, {
          title: "Oops, we can't find this place!",
          text: "Please try a new place!",
          warning: true,
        });
        return null;
      }
      const node = data[0];
      return node;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching coordinates:", error);
      return null; // Return null or handle the error as needed
    }
  }

  /**
   * Handles the search action, fetches address info, and displays the location on a map.
   * @param searchterm The search term to find the location.
   */
  public async _handleSearchAction(searchterm: string) {
    // Search action
    if (!searchterm) return;
    const data = await this._fetchAdressInfo(searchterm);
    if (!data) return;
    // Extract latitudes and longitudes
    const latValues = data.lat;
    const lonValues = data.lon;

    const leaflet = this.Leaflet;
    const map = this.leafletMap;
    if (!map || !leaflet) return;
    map.setView([latValues, lonValues], this.zoom);
    // Clear previoud markers
    this._clearRouteLayer();
    const foundAddress = leaflet.marker([latValues, lonValues]).addTo(map);
    // Create popup content
    const popupContent = `
      <div>
        <strong>${data.name || "Unknown Location"}</strong><br/>
        ${data.display_name || "No address available"}
      </div>
    `;

    // Bind popup to the marker
    foundAddress.bindPopup(popupContent).openPopup();
    this.markers.push(foundAddress);
  }

  private _clearRouteLayer() {
    // Clear previoud markers
    this.markers.forEach((marker) => marker.remove());
    this.markers = [];
    if (this._routeLayer) {
      this.leafletMap?.removeLayer(this._routeLayer); // Remove the route from the map
      this._routeLayer = null; // Reset the reference
    }
    this.noteMarkers.forEach((marker) => {
      marker.closePopup();
    });
  }

  public _handleAddANote() {
    const map = this.leafletMap;
    const leaflet = this.Leaflet;
    if (!map || !leaflet) return;

    // Create a red marker icon
    const redIcon = leaflet.icon({
      iconUrl: "https://img.icons8.com/ios-filled/50/FA5252/marker.png", // URL for red marker icon
      iconSize: [35, 41], // Size of the icon
      iconAnchor: [12, 41], // Anchor point of the icon
      popupAnchor: [1, -34], // Anchor point of the popup relative to the icon
    });

    // Create a marker at the center of the map
    const initialLatLng = map.getCenter();
    const noteMarker = leaflet
      .marker(initialLatLng, { icon: redIcon, draggable: true }) // Make the marker draggable
      .addTo(map);

    // Add the marker to the noteMarkers array for tracking
    this.noteMarkers.push(noteMarker);
    this.noteData.set(noteMarker, "");

    // Bind popup with Add Note button
    const updatePopupContent = (note: string = "No note added yet.") => {
      noteMarker
        .bindPopup(
          `
      <div>
        <strong>Note:</strong> <span id="note-content">${note}</span><br/>
        Drag this marker to the desired location.<br/>
        <button id="add-note" style="margin-top: 5px;">Add Note</button>
        <button id="remove-note" style="margin-top: 5px; color: red;">Remove Note</button>
      </div>
    `
        )
        .openPopup();
    };

    // Add click event to remove the marker
    noteMarker.on("popupopen", () => {
      // Add event listener for the "Remove Note" button
      const popupContent = noteMarker.getPopup()?.getElement();
      if (!popupContent) {
        // eslint-disable-next-line no-console
        console.error("Popup content not found");
        return;
      }
      const note = this.noteData.get(noteMarker) || "No note added yet.";
      // Update the popup content dynamically
      const noteElement = popupContent.querySelector(
        "#note-content"
      ) as HTMLElement;
      if (noteElement) {
        noteElement.textContent = note;
        updatePopupContent(note);
      }

      // Add note button functionality
      const addNoteButton = popupContent.querySelector(
        "#add-note"
      ) as HTMLElement;
      if (!addNoteButton) {
        // eslint-disable-next-line no-console
        console.error("Add note button not found in popup");
        return;
      }
      addNoteButton.addEventListener("click", async () => {
        console.log("första ", this.noteData.get(noteMarker))
        const response = await showAddNoteDialog(this, {existingNote: this.noteData.get(noteMarker)});
        this.noteData.set(noteMarker, response || ""); // Update the note in the Map
        console.log("dnotedata ", this.noteData.response)
        noteMarker.closePopup();
      });

      const removeButton = popupContent.querySelector(
        "#remove-note"
      ) as HTMLElement;
      if (!removeButton) {
        // eslint-disable-next-line no-console
        console.error("Remove button not found in popup");
        return;
      }

      // Add event listener for the "Remove Note" button
      removeButton.addEventListener("click", () => {
        // Remove the marker from the map and the array
        map.removeLayer(noteMarker);
        this.noteMarkers = this.noteMarkers.filter(
          (marker) => marker !== noteMarker
        );
        this.noteData.delete(noteMarker);
      });
    });

    // Add dragend event to update marker position
    noteMarker.on("dragend", () => {
      const { lat, lng } = noteMarker.getLatLng();
      // eslint-disable-next-line no-console
      console.log(`Marker moved to: ${lat}, ${lng}`);
    });
    updatePopupContent();
  }

  /**
   * Handles the navigation action by fetching route information and displaying it on the map.
   * @param startPoint The starting point address.
   * @param endPoint The destination address.
   * @param transportMode The mode of transportation (e.g., walking, driving).
   */
  public async _handleNavigationAction(
    // Show direction function
    startPoint: string,
    endPoint: string,
    transportMode: string
  ) {
    let startInfo: { name: string; lat: number; lon: number } | null = null;
    let endInfo: { name: string; lat: number; lon: number } | null = null;
    if (startPoint === "") {
      startInfo = {
        name: "Current location",
        lat: this._location[0],
        lon: this._location[1],
      };
    } else {
      const fetchedStart = await this._fetchAdressInfo(startPoint);
      if (!fetchedStart) {
        // eslint-disable-next-line no-console
        console.error("Failed to fetch start coordinates.");
        return; // Exit if start coordinates couldn't be fetched
      }
      startInfo = {
        name: fetchedStart.name,
        lat: fetchedStart.lat,
        lon: fetchedStart.lon,
      };
    }
    if (endPoint === "") {
      endInfo = {
        name: "Current location",
        lat: this._location[0],
        lon: this._location[1],
      };
    } else {
      const fetchedEnd = await this._fetchAdressInfo(endPoint);
      if (!fetchedEnd) {
        // eslint-disable-next-line no-console
        console.error("Failed to fetch end coordinates.");
        return; // Exit if end coordinates couldn't be fetched
      }
      endInfo = {
        name: fetchedEnd.name,
        lat: fetchedEnd.lat,
        lon: fetchedEnd.lon,
      };
    }
    if (startInfo.lat === endInfo.lat && startInfo.lon === endInfo.lon) {
      showToast(this, {
        message: "Please provide a valid destination!",
      });
      return;
    }

    try {
      const { route, duration, distance, steps } = await this._fetchRoute(
        [startInfo.lat, startInfo.lon],
        [endInfo.lat, endInfo.lon],
        transportMode
      );
      const leaflet = this.Leaflet;
      const map = this.leafletMap;
      if (!map || !leaflet) return;
      this._clearRouteLayer();
      // Display the route on the map
      this._routeLayer = leaflet
        .geoJSON(route, {
          style: { color: "blue", weight: 5 },
        })
        .addTo(map);

      // Add start and end markers
      const startMarker = leaflet
        .marker([startInfo.lat, startInfo.lon])
        .addTo(map);
      startMarker.bindPopup("Start Point").openPopup();
      const endMarker = leaflet.marker([endInfo.lat, endInfo.lon]).addTo(map);
      endMarker.bindPopup("End Point");
      this.markers.push(startMarker);
      this.markers.push(endMarker);
      // Show step by step distance
      this.renderSidePanel({ steps, distance, duration });
      // Fit the map bounds to the route
      map.fitBounds(this._routeLayer.getBounds());

      // Click to show restaurants
      const startRestaurants = await this._fetchRestaurantsNearLocation([
        startInfo.lat,
        startInfo.lon,
      ]);
      const endRestaurants = await this._fetchRestaurantsNearLocation([
        endInfo.lat,
        endInfo.lon,
      ]);
      this._addRestaurantMarkers(startRestaurants);
      this._addRestaurantMarkers(endRestaurants);
      this._routeLayer.on("click", (e: any) =>
        this._handleRouteClick(e.latlng)
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching or displaying route:", error);
    }
  }

  /**
   * Renders the side panel displaying the route details including steps, distance, and duration.
   * @param routeData An object containing the route's steps, distance, and duration.
   */
  private renderSidePanel(routeData: {
    steps: any[];
    distance: string;
    duration: string;
  }) {
    // Remove existing panel if any
    const existingPanel = document.getElementById("directions-panel");
    if (existingPanel) {
      existingPanel.remove();
    }

    // Create the side panel
    const sidePanel = document.createElement("div");
    sidePanel.id = "directions-panel";
    sidePanel.style.cssText = `
      position: fixed;
      right: 1%;
      top: 15%;;
      height: 70%;
      width: 300px;
      background: white;
      border-left: 1px solid #ccc;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
      padding: 20px;
    `;
    const distanceTotal = Number(routeData.distance);
    const durationTotal = Number(routeData.duration);
    const formattedDistance =
      distanceTotal < 1000
        ? `${Math.round(distanceTotal)} m`
        : `${(distanceTotal / 1000).toFixed(1)} km`;
    const formattedDuration =
      durationTotal >= 3600
        ? `${Math.floor(durationTotal / 3600)}h ${Math.floor((durationTotal % 3600) / 60)}min`
        : `${Math.floor(durationTotal / 60)} min`;

    // Add header
    sidePanel.innerHTML = `
      <h2 style="margin-top: 0;">Directions</h2>
      <p><strong>Distance:</strong> ${formattedDistance}</p>
      <p><strong>Time:</strong> ${formattedDuration}</p>
      <hr />
    `;

    // Add steps
    routeData.steps.forEach((step, index) => {
      let instruction = "";
      const maneuver = step.maneuver;
      const direction = maneuver.type || "Continue"; // Maneuver type (e.g., "turn-left")
      const modifier = maneuver.modifier || ""; // Directional modifier (e.g., "left", "right")
      const street = step.name || ""; // Street name (e.g., "Chalmers Tvärgata")

      if (modifier) {
        instruction = `${direction.charAt(0).toUpperCase() + direction.slice(1)} ${modifier} onto ${street}`;
      } else if (street) {
        instruction = `Continue onto ${street}`;
      } else {
        instruction = "Continue straight";
      }

      const distance = (step.distance / 1000).toFixed(2) + " km";

      const stepElement = document.createElement("div");
      stepElement.style.cssText = `
        margin-bottom: 10px;
        padding: 10px;
        border: 1px solid #eee;
        border-radius: 4px;
      `;
      stepElement.innerHTML = `
        <strong>${index + 1}. ${instruction}</strong><br />
        <small>${distance}</small>
      `;

      sidePanel.appendChild(stepElement);
    });

    // Add close button
    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: #ff6b6b;
      color: white;
      border: none;
      padding: 5px 10px;
      border-radius: 3px;
      cursor: pointer;
    `;
    closeButton.addEventListener("click", () => {
      sidePanel.remove();
      this._clearRouteLayer();
    });

    sidePanel.appendChild(closeButton);

    // Append to body
    document.body.appendChild(sidePanel);
  }

  /**
   * Handles a click event on a route marker, fetching nearby restaurants for the given location.
   * @param latlng - Latitude and longitude coordinates of the clicked location.
   */
  private async _handleRouteClick(latlng: { lat: number; lng: number }) {
    try {
      const nearbyRestaurants = await this._fetchRestaurantsNearLocation([
        latlng.lat,
        latlng.lng,
      ]);
      this._addRestaurantMarkers(nearbyRestaurants);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching nearby restaurants:", error);
    }
  }

  /**
   * Adds markers for restaurants on the map for each restaurant in the provided list.
   * Each marker is clickable, and upon clicking, displays detailed information about the restaurant.
   * @param restaurants - Array of restaurant objects containing latitude and longitude information.
   */
  private async _addRestaurantMarkers(restaurants: any[]) {
    const leaflet = this.Leaflet;
    const map = this.leafletMap;
    if (!map || !leaflet) return;
    const _icon = leaflet.icon({
      iconUrl: "https://img.icons8.com/glyph-neue/64/meal.png", // Restaurant icon
      iconSize: [25, 25],
      iconAnchor: [12, 25],
      popupAnchor: [0, -20],
    });
    restaurants.forEach((restaurant) => {
      const marker = leaflet
        .marker([restaurant.lat, restaurant.lon], { icon: _icon })
        .addTo(map);
      // marker.bindPopup(

      marker.on("click", async () => {
        const details = await this._showRestaurantDetails(
          restaurant.lat,
          restaurant.lon
        );
        const popupContent = this._generatePopupContent(details);
        marker.bindPopup(popupContent).openPopup();
      });
      this.markers.push(marker);
    });
  }

  /**
   * Fetches detailed information for a restaurant from OpenStreetMap based on the restaurant's latitude and longitude.
   * @param lat - Latitude of the restaurant.
   * @param lon - Longitude of the restaurant.
   * @returns A promise that resolves to the restaurant's details in JSON format.
   */
  private async _showRestaurantDetails(lat: number, lon: number): Promise<any> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&extratags=1`;
      const details = await this.fetchApiJson(url);
      return details;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching restaurant details:", error);
      return null;
    }
  }

  /**
   * Generates the HTML content for a popup displaying restaurant details.
   *
   * @param details - The restaurant details to display.
   * @returns A string containing the HTML content for the popup.
   */
  private _generatePopupContent(details: any): string {
    if (!details) {
      return "<strong>Unable to fetch details</strong>";
    }

    const name = details.name || "Unnamed Restaurant";
    const type = details.type || "Unknown Type";
    const phone = details.extratags?.phone || "Not available";
    const address = details.display_name || "Unknown Address";
    const website = details.extratags?.website
      ? `<a href="${details.extratags.website}" target="_blank">${details.extratags.website}</a>`
      : "Not available";

    return `
      <div>
        <h3>${name}</h3>
        <p><strong>Type:</strong> ${type}</p>
        <p><strong>Address:</strong> ${address}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Website:</strong> ${website}</p>
      </div>
    `;
  }

  /**
   * Fetches restaurants near the specified location within a 500m radius.
   *
   * @param location - A tuple representing the latitude and longitude of the location.
   * @returns A Promise that resolves to an array of restaurants within the radius.
   */
  private async _fetchRestaurantsNearLocation(
    location: [number, number]
  ): Promise<any[]> {
    const [lat, lon] = location;
    try {
      // Query restaurants within a 500m radius (adjust as needed)
      const data = await this.fetchApiJson(
        `https://overpass-api.de/api/interpreter?data=[out:json];node["amenity"="restaurant"](around:500,${lat},${lon});out;`
      );

      const validRestaurants = data.elements.filter(
        (restaurant: any) => restaurant.tags && restaurant.tags.name
      );
      // Limit the number of restaurants to `count`
      return validRestaurants.slice(0, 6);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching restaurants:", error);
      return [];
    }
  }

  /**
   * Fetches a route between two geographical points using the specified transport mode.
   *
   * @param start - The start point as a tuple of latitude and longitude.
   * @param end - The end point as a tuple of latitude and longitude.
   * @param transportMode - The mode of transport (car, bicycle, or foot).
   * @returns A Promise that resolves to an object containing the route geometry, duration, distance, and steps.
   * @throws An error if no route is found.
   */
  async _fetchRoute(
    start: [number, number],
    end: [number, number],
    transportMode: string
  ) {
    const transport_mode =
      transportMode === "car"
        ? "car"
        : transportMode === "bicycle"
          ? "bike"
          : "foot";

    const [startLat, startLon] = start;
    const [endLat, endLon] = end;
    // https://routing.openstreetmap.de/routed-foot/route/v1/driving/11.97652589525446,57.6897462;11.9634657,57.7040307?overview=false&geometries=polyline&steps=true&
    const url = `https://routing.openstreetmap.de/routed-${transport_mode}/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson&steps=true`;
    const data = await this.fetchApiJson(url);

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        route: route.geometry,
        duration: route.duration, // Duration in seconds
        distance: route.distance, // Distance in meters
        steps: route.legs[0]?.steps,
      };
    }
    throw new Error("No route found");
  }

  public fitBounds(
    boundingbox: LatLngExpression[],
    options?: { zoom?: number; pad?: number }
  ) {
    if (!this.leafletMap || !this.Leaflet || !this.hass) {
      return;
    }
    const bounds = this.Leaflet.latLngBounds(boundingbox).pad(
      options?.pad ?? 0.5
    );
    this.leafletMap.fitBounds(bounds, { maxZoom: options?.zoom || this.zoom });
  }

  /**
   * Switches the map to the standard tile layer.
   */
  public changeToStandardLayer(): void {
    const map = this.leafletMap!;
    const leaflet = this.Leaflet!;
    map.eachLayer((layer) => {
      if (layer instanceof TileLayer) {
        map.removeLayer(layer);
      }
    });
    this.layer = createTileLayer(leaflet)?.addTo(map);
  }

  /**
   * Switches the map to the CyclOSM tile layer.
   */
  public changeToCyclOSMLayer(): void {
    const map = this.leafletMap!;
    const leaflet = this.Leaflet!;

    const cyclOSMTileLayer = createCyclOSMTileLayer(leaflet);

    this.layer = cyclOSMTileLayer.addTo(map);
  }

  /**
   * Switches the map to the CycleMap tile layer.
   */
  public changeToCycleMapLayer(): void {
    const map = this.leafletMap!;
    const leaflet = this.Leaflet!;

    const cyclOSMTileLayer = createCycleMapTileLayer(leaflet);

    this.layer = cyclOSMTileLayer.addTo(map);
  }

  /**
   * Switches the map to the TransportMap tile layer.
   */
  public changeToTransportMapLayer(): void {
    const map = this.leafletMap!;
    const leaflet = this.Leaflet!;

    const cyclOSMTileLayer = createTransportMapTileLayer(leaflet);

    this.layer = cyclOSMTileLayer.addTo(map);
  }

  /**
   * Switches the map to the HotMap tile layer.
   */
  public changeToHotMapLayer(): void {
    const map = this.leafletMap!;
    const leaflet = this.Leaflet!;

    const cyclOSMTileLayer = createHotMapTileLayer(leaflet);

    this.layer = cyclOSMTileLayer.addTo(map);
  }

  /**
   * Computes the tooltip content for a path point.
   *
   * @param path - The path object containing the points and details.
   * @param point - The specific point on the path to generate the tooltip for.
   * @returns A string representing the tooltip content for the path point.
   */
  private _computePathTooltip(path: HaMapPaths, point: HaMapPathPoint): string {
    let formattedTime: string;
    if (path.fullDatetime) {
      formattedTime = formatDateTime(
        point.timestamp,
        this.hass.locale,
        this.hass.config
      );
    } else if (isToday(point.timestamp)) {
      formattedTime = formatTimeWithSeconds(
        point.timestamp,
        this.hass.locale,
        this.hass.config
      );
    } else {
      formattedTime = formatTimeWeekday(
        point.timestamp,
        this.hass.locale,
        this.hass.config
      );
    }
    return `${path.name}<br>${formattedTime}`;
  }

  /**
   * Draws paths on the map, including markers and lines between points.
   */
  private _drawPaths(): void {
    const hass = this.hass;
    const map = this.leafletMap;
    const Leaflet = this.Leaflet;

    if (!hass || !map || !Leaflet) {
      return;
    }
    if (this._mapPaths.length) {
      this._mapPaths.forEach((marker) => marker.remove());
      this._mapPaths = [];
    }
    if (!this.paths) {
      return;
    }

    const darkPrimaryColor = getComputedStyle(this).getPropertyValue(
      "--dark-primary-color"
    );

    this.paths.forEach((path) => {
      let opacityStep: number;
      let baseOpacity: number;
      if (path.gradualOpacity) {
        opacityStep = path.gradualOpacity / (path.points.length - 2);
        baseOpacity = 1 - path.gradualOpacity;
      }

      for (
        let pointIndex = 0;
        pointIndex < path.points.length - 1;
        pointIndex++
      ) {
        const opacity = path.gradualOpacity
          ? baseOpacity! + pointIndex * opacityStep!
          : undefined;

        // DRAW point
        this._mapPaths.push(
          Leaflet!
            .circleMarker(path.points[pointIndex].point, {
              radius: isTouch ? 8 : 3,
              color: path.color || darkPrimaryColor,
              opacity,
              fillOpacity: opacity,
              interactive: true,
            })
            .bindTooltip(
              this._computePathTooltip(path, path.points[pointIndex]),
              { direction: "top" }
            )
        );

        // DRAW line between this and next point
        this._mapPaths.push(
          Leaflet!.polyline(
            [path.points[pointIndex].point, path.points[pointIndex + 1].point],
            {
              color: path.color || darkPrimaryColor,
              opacity,
              interactive: false,
            }
          )
        );
      }
      const pointIndex = path.points.length - 1;
      if (pointIndex >= 0) {
        const opacity = path.gradualOpacity
          ? baseOpacity! + pointIndex * opacityStep!
          : undefined;
        // DRAW end path point
        this._mapPaths.push(
          Leaflet!
            .circleMarker(path.points[pointIndex].point, {
              radius: isTouch ? 8 : 3,
              color: path.color || darkPrimaryColor,
              opacity,
              fillOpacity: opacity,
              interactive: true,
            })
            .bindTooltip(
              this._computePathTooltip(path, path.points[pointIndex]),
              { direction: "top" }
            )
        );
      }
      this._mapPaths.forEach((marker) => map.addLayer(marker));
    });
  }

  /**
   * Draws entities and zones on the map, including markers and circles for each.
   * It handles both active and passive zones, adjusts for dark mode, and includes additional
   * information like GPS accuracy or custom titles where applicable.
   *
   * @returns {void}
   */
  private _drawEntities(): void {
    const hass = this.hass;
    const map = this.leafletMap;
    const Leaflet = this.Leaflet;

    if (!hass || !map || !Leaflet) {
      return;
    }

    if (this._mapItems.length) {
      this._mapItems.forEach((marker) => marker.remove());
      this._mapItems = [];
      this._mapFocusItems = [];
    }

    if (this._mapZones.length) {
      this._mapZones.forEach((marker) => marker.remove());
      this._mapZones = [];
      this._mapFocusZones = [];
    }

    if (!this.entities) {
      return;
    }

    const computedStyles = getComputedStyle(this);
    const zoneColor = computedStyles.getPropertyValue("--accent-color");
    const passiveZoneColor = computedStyles.getPropertyValue(
      "--secondary-text-color"
    );

    const darkPrimaryColor = computedStyles.getPropertyValue(
      "--dark-primary-color"
    );

    const className = this._darkMode ? "dark" : "light";

    for (const entity of this.entities) {
      const stateObj = hass.states[getEntityId(entity)];
      if (!stateObj) {
        continue;
      }
      const customTitle = typeof entity !== "string" ? entity.name : undefined;
      const title = customTitle ?? computeStateName(stateObj);
      const {
        latitude,
        longitude,
        passive,
        icon,
        radius,
        entity_picture: entityPicture,
        gps_accuracy: gpsAccuracy,
      } = stateObj.attributes;

      if (!(latitude && longitude)) {
        continue;
      }

      if (computeStateDomain(stateObj) === "zone") {
        // DRAW ZONE
        if (passive && !this.renderPassive) {
          continue;
        }

        // create icon
        let iconHTML = "";
        if (icon) {
          const el = document.createElement("ha-icon");
          el.setAttribute("icon", icon);
          iconHTML = el.outerHTML;
        } else {
          const el = document.createElement("span");
          el.innerHTML = title;
          iconHTML = el.outerHTML;
        }

        // create marker with the icon
        this._mapZones.push(
          Leaflet.marker([latitude, longitude], {
            icon: Leaflet.divIcon({
              html: iconHTML,
              iconSize: [24, 24],
              className,
            }),
            interactive: this.interactiveZones,
            title,
          })
        );

        // create circle around it
        const circle = Leaflet.circle([latitude, longitude], {
          interactive: false,
          color: passive ? passiveZoneColor : zoneColor,
          radius,
        });
        this._mapZones.push(circle);
        if (
          this.fitZones &&
          (typeof entity === "string" || entity.focus !== false)
        ) {
          this._mapFocusZones.push(circle);
        }

        continue;
      }

      // DRAW ENTITY
      // create icon
      const entityName =
        typeof entity !== "string" && entity.label_mode === "state"
          ? this.hass.formatEntityState(stateObj)
          : (customTitle ??
            title
              .split(" ")
              .map((part) => part[0])
              .join("")
              .substr(0, 3));

      // create marker with the icon
      const marker = Leaflet.marker([latitude, longitude], {
        icon: Leaflet.divIcon({
          html: `
              <ha-entity-marker
                entity-id="${getEntityId(entity)}"
                entity-name="${entityName}"
                entity-picture="${
                  entityPicture ? this.hass.hassUrl(entityPicture) : ""
                }"
                ${
                  typeof entity !== "string"
                    ? `entity-color="${entity.color}"`
                    : ""
                }
              ></ha-entity-marker>
            `,
          iconSize: [48, 48],
          className: "",
        }),
        title: title,
      });
      this._mapItems.push(marker);
      if (typeof entity === "string" || entity.focus !== false) {
        this._mapFocusItems.push(marker);
      }

      // create circle around if entity has accuracy
      if (gpsAccuracy) {
        this._mapItems.push(
          Leaflet.circle([latitude, longitude], {
            interactive: false,
            color: darkPrimaryColor,
            radius: gpsAccuracy,
          })
        );
      }
    }

    this._mapItems.forEach((marker) => map.addLayer(marker));
    this._mapZones.forEach((marker) => map.addLayer(marker));
  }

  /**
   * Attaches a resize observer to the current element.
   *
   * @returns {Promise<void>} Resolves once the observer is attached.
   */
  private async _attachObserver(): Promise<void> {
    if (!this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        this.leafletMap?.invalidateSize({ debounceMoveend: true });
      });
    }
    this._resizeObserver.observe(this);
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        display: block;
        height: 300px;
      }
      #map {
        height: 100%;
      }
      #map.dark {
        background: #090909;
      }
      #map.forced-dark {
        color: #ffffff;
        --map-filter: invert(0.9) hue-rotate(170deg) brightness(1.5)
          contrast(1.2) saturate(0.3);
      }
      #map.forced-light {
        background: #ffffff;
        color: #000000;
        --map-filter: invert(0);
      }
      #map:active {
        cursor: grabbing;
        cursor: -moz-grabbing;
        cursor: -webkit-grabbing;
      }
      .leaflet-tile-pane {
        filter: var(--map-filter);
      }
      .dark .leaflet-bar a {
        background-color: #1c1c1c;
        color: #ffffff;
      }
      .dark .leaflet-bar a:hover {
        background-color: #313131;
      }
      .leaflet-marker-draggable {
        cursor: move !important;
      }
      .leaflet-edit-resize {
        border-radius: 50%;
        cursor: nesw-resize !important;
      }
      .named-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        text-align: center;
        color: var(--primary-text-color);
      }
      .leaflet-pane {
        z-index: 0 !important;
      }
      .leaflet-control,
      .leaflet-top,
      .leaflet-bottom {
        z-index: 1 !important;
      }
      .leaflet-tooltip {
        padding: 8px;
        font-size: 90%;
        background: rgba(80, 80, 80, 0.9) !important;
        color: white !important;
        border-radius: 4px;
        box-shadow: none !important;
        text-align: center;
      }
      .leaflet-control {
        margin-top: 50px; /* Move zoom controls down */
      }
    `;
  }
}
declare global {
  interface HTMLElementTagNameMap {
    "ha-osm": HaOSM;
  }
}
