# DOCm

Chatbot assistant module for the ROCm Docs.

## Installation

To develop and test the application, ensure that Node.JS and npm are installed.
Then, install the required package manager and Angular dependencies:
```bash
npm install -g pnpm
pnpm install
```

## Development server

To start a local development server, run:

```bash
ng serve
```

This will launch an empty webpage with only the chatbot window. Styles may be
included manually by modifying the output directory.

Once the server is running, open your browser and navigate to
`http://localhost:4200/`. The application will automatically reload whenever you
modify any of the source files.

### Inheriting production styles

To iterate styling for the assistant, the Angular development server can proxy
to a currently running ROCm Docs web server to retrieve its styling. To develop
with the production Docs styling, run:

```bash
ng serve --configuration sphinx
```

This will run the server and proxy the target stylesheets in `index.sphinx.html`
to their source defined in `proxy.sphinx.conf.json`. To create the server at
the specified URL, build the ROCm Docs and run a web server (e.g.
[http-server](https://www.npmjs.com/package/http-server)) to host the compiled
output. 

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/`
directory. Once built, the resulting build artifact may be included in the
`theme.py` file for the desired Sphinx theme to include the chatbot. The app
will inherit styling from the underlying Sphinx stylesheets.
