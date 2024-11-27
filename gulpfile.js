// Import BrowserSync for live reloading and development server
import browserSync from "browser-sync";

// Import Gulp for defining tasks
import gulp from "gulp";

// Create a BrowserSync instance
const bs = browserSync.create();

// Task: Initialize the development server
gulp.task("develop-app", (done) => {
  // Initialize the server
  bs.init({
    server: {
      baseDir: "./", // Root directory for the server
      index: "index.html", // Entry file for the server
    },
    port: 3000, // Port to listen on
  });

  // Watch for file changes and reload the browser
  gulp.watch("src/**/*.*").on("change", bs.reload);

  done();
});

// Default task (for example, could be used to run 'develop-app')
gulp.task("default", gulp.series("develop-app"));
