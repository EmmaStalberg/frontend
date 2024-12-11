# Home Assistant Frontend

This is the repository for the official [Home Assistant](https://home-assistant.io) frontend.

- [View demo of Home Assistant](https://demo.home-assistant.io/)
- [More information about Home Assistant](https://home-assistant.io)
- [Frontend development instructions](https://developers.home-assistant.io/docs/frontend/development/)
  
![Screenshot of the frontend](https://github.com/EmmaStalberg/frontend/blob/dev-main-frontend/OSM%20screenshot.jpg)

## **Features**
### **OpenStreetMap Integration**
- **Dynamic Map Layer Switching**:  
  Toggle between various map layers (e.g., standard, satellite views) to customize your view.
- **Search Functionality**:  
  Quickly find addresses and coordinates.
- **Route Planning and Directions**:  
  Input starting and destination points to get optimal routes with turn-by-turn navigation.
- **Facility Suggestions Along Routes**:  
  Highlights nearby facilities like restaurants along the route, helping users find relevant locations with ease.
- **Custom Markers and Annotations**:  
  Add personal notes or highlight important locations directly on the map.
- **Location Sharing**:  
  Share specific locations or routes via links.

### **Improved Dashboard Customization**
- Add OpenStreetMap as a dedicated dashboard panel with custom icons and titles.
- Supports advanced map interactions, including zoom, pan, and reset functionalities.

## Custom component for OpenStreetMap - Installation
- Go to http://localhost:8123/profile/general and enable Advanced mode.
- Go to http://localhost:8123/config/lovelace/dashboards and add dashborad.
- Select map, and use "Open Street Map" as title, use mdi:map as icon. Open "Show in sidebar".
- Open the dashboard you created, press the icon <img width="25" height="25" alt="Screenshot 2024-12-10 at 23 08 59" src="https://github.com/user-attachments/assets/72adaa1b-0426-4d77-8ad5-8ce6ecc87aa0">
on the top right corner and then press "TAKE CONTROL".
- Press the icon <img width="25" height="25" alt="Screenshot 2024-12-10 at 23 09 56" src="https://github.com/user-attachments/assets/1f1176a8-65a3-4aaf-834d-85cebd09b4c0"> on the top right cornor, and choose "Raw configuration editor".
- Copy code below to the configuration.
```language
views:
  - type: panel
    title: Open Street Map
    icon: mdi:map
    cards:
      - type: osm
        auto_fit: true
        entities:
          - zone.home
```
- Save your changes.
  
## **Development Instructions**

### **Frontend Customization**
The frontend enhancements include:

- **Component Path:**  
  The OpenStreetMap frontend logic is located in the following directory:  
  `frontend/src/panels/map/osm-panel.js`

- **Dynamic Routing and Facility Suggestions:**  
  Implemented using Leaflet with integrated OpenStreetMap APIs for real-time route rendering and facility display.

- **Custom Card Design:**  
  Code for OpenStreetMap dashboard cards is defined in:  
  `frontend/src/components/cards/osm-card.js`

---

### **Testing the Frontend**
- Relevant test cases for the frontend are stored in:  
  `frontend/test/components/osm/`

- To run all unit tests, use the following command:
  ```bash
  npm test

## License

Home Assistant is open-source and Apache 2 licensed. Feel free to browse the repository, learn and reuse parts in your own projects.

We use [BrowserStack](https://www.browserstack.com) to test Home Assistant on a large variety of devices.

[![Home Assistant - A project from the Open Home Foundation](https://www.openhomefoundation.org/badges/home-assistant.png)](https://www.openhomefoundation.org/)
