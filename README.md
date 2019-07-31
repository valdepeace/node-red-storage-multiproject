## Node-RED storage multiproject   

### Instalación
```
npm install node-red-storage-multiproject
```
### Configuracion 

En nuestro fichero settings.js:
```
storageModule:require('node-red-storage-multiproject'),
mongodbMultiproject:{port:27017,host:"localhost",bd:"test",user:"user",password:"password",collectionProject:"other-Collection-Project"}
```
default mongodbMultiproject:
- port: 27017
- host: localhost
- bd: test
- user:
- password:
- collectionProject: Project

    **Nota**: collectionProject es para usar una coleccion diferente para project pero al menos tiene que tener el campo/propiedad 'description' ya 
    que sera usado para el nombre del proyecto.
    
Ejemplo:

```
 functionGlobalContext: {
        // os:require('os'),
        // octalbonescript:require('octalbonescript'),
        // jfive:require("johnny-five"),
        // j5board:require("johnny-five").Board({repl:false})
    },

    // The following property can be used to order the categories in the editor
    // palette. If a node's category is not in the list, the category will get
    // added to the end of the palette.
    // If not set, the following default order is used:
    //paletteCategories: ['subflows', 'input', 'output', 'function', 'social', 'mobile', 'storage', 'analysis', 'advanced'],

    // Configure the logging output
    logging: {
        // Only console logging is currently supported
        console: {
            // Level of logging to be recorded. Options are:
            // fatal - only those errors which make the application unusable should be recorded
            // error - record errors which are deemed fatal for a particular request + fatal errors
            // warn - record problems which are non fatal + errors + fatal errors
            // info - record information about the general running of the application + warn + error + fatal errors
            // debug - record information which is more verbose than info + info + warn + error + fatal errors
            // trace - record very detailed logging + debug + info + warn + error + fatal errors
            level: "info",
            // Whether or not to include metric events in the log output
            metrics: false,
            // Whether or not to include audit events in the log output
            audit: false
        }
    },
    storageModule:require('node-red-storage-multiproject'),
    mongodbMultiproject:{port:27017,host:"localhost",bd:"test"}
}
```
Este modulo para node-red se integra con node-red-contrib-multiproject y sirve para grabar los flows y projectos a mongodb.

En el se crearan las coleccions:

- Flows
- Settings(nodes, contrib)

No esta integrado(a futuro) por lo que se grabaran en fichero en disco:

- Credentials
- Sessions
- Library

Contributors: Miguel Angel Salinas(miguel@thingtrack.com)
Company: [Thingtrack s.l](http://www.thingtrack.com)
