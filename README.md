# Home Assistant Frontend

This is the repository for the official [Home Assistant](https://home-assistant.io) frontend.

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
  
## License

Home Assistant is open-source and Apache 2 licensed. Feel free to browse the repository, learn and reuse parts in your own projects.

We use [BrowserStack](https://www.browserstack.com) to test Home Assistant on a large variety of devices.

[![Home Assistant - A project from the Open Home Foundation](https://www.openhomefoundation.org/badges/home-assistant.png)](https://www.openhomefoundation.org/)
