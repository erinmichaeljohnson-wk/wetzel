"use strict";
var defined = require('./defined');
var defaultValue = require('./defaultValue');
var path = require('path');
var fs = require('fs');
var jsonpointer = require('jsonpointer');
var requestSync = require('sync-request');
module.exports = replaceRef;


var refSchemaFetcher = new (function () {
    var fetchers = {
        'https://': (ref, searchPath, location) => {return {$id: location, title: location}},
        'http://': (ref, searchPath, location) => JSON.parse(requestSync('GET', location).body),
        'file:///': (ref, searchPath, location) => this[''](ref, searchPath, location.substring('file:///'.length)),
        '/': (ref, searchPath, location) => { throw Error(`Absolute $ref not supported ${ref}`)},
        '': (ref, searchPath, location) => JSON.parse(fs.readFileSync(path.join(searchPath, location)))
    };

    this.fetch = function(ref, searchPath, location) {
       var type = Object.keys(fetchers).find(prefix => location.startsWith(prefix));
       return fetchers[type](ref, searchPath, location);
    };
})();

/**
* @function replaceRef
* Replaces json schema file references referenced with a $ref property
* with the actual file content from the referenced schema file.
* @todo Does not currently support absolute reference paths, only relative paths.
* @param  {object} schema - The parsed json schema file as an object
* @param  {string[]} searchPaths - The path list where any relative schema file references could be resolved
* @param  {string[]} ignorableTypes - An array of schema filenames that shouldn't get their own documentation section.
* @param  {object} schemaReferences - An object that will be populated with all schemas referenced by this object
* @param  {string} parentTitle - A string that contains the title of the parent object
* @param  {object} root - The root schema
* @return {object} The schema object with all schema file referenced replaced with the actual file content.
*/
function replaceRef(schema, searchPaths, ignorableTypes, schemaReferences, parentTitle, root) {
    if (!root) {
        root = schema;
    }

    schemaReferences = defaultValue(schemaReferences, {});

    var ref = schema.$ref;

    // ignore refs to expression conditionals due to the ref-cycle
    if (ref && ref.includes('expression-conditional')) ref = undefined

    if (defined(ref)) {
        // TODO: $ref could also be absolute.
        var refSchema, fileName;
        for (var searchPath of searchPaths) {
            try {
                var [file, pointer] = ref.split(/#(.*)/);
                if (file) {
                    refSchema = refSchemaFetcher.fetch(ref, searchPath, file);
                    fileName = file;
                } else {
                    refSchema = root;
                    fileName = '';
                }
                if (pointer) {
                    refSchema = jsonpointer.get(refSchema, pointer);
                    refSchema.typeName = pointer.split('/').pop();
                }
                break;
            } catch (ex) { refSchema = undefined; }
        }

        if (!defined(refSchema)) {
            throw new Error(`Unable to find $ref ${ref}`);
        }

        if (!defined(refSchema.title)) {
            throw new Error(`No title found in $ref ${ref}`);
        }

        // If a type is supposed to be ignored, that means that its contents should be applied
        // to the referencing schema, but it shouldn't be called out as a top-level type by itself
        // (meaning it would never show up in a table of contents or get its own documentation section).
        if (ignorableTypes.indexOf(ref.toLowerCase()) < 0) {
            if (refSchema.title in schemaReferences) {
                // update schema and fileName in case it was inserted by a child first
                schemaReferences[refSchema.title].schema = refSchema;
                schemaReferences[refSchema.title].fileName = fileName;
                schemaReferences[refSchema.title].parents.push(parentTitle);
            }
            else {
                schemaReferences[refSchema.title] = { schema: refSchema, fileName, parents: [parentTitle], children: [] };
            }

            if (parentTitle in schemaReferences) {
                schemaReferences[parentTitle].children.push(refSchema.title);
            }
            else {
                schemaReferences[parentTitle] = { schema: undefined, fileName: undefined, parents: [], children: [refSchema.title] };
            }

            // From a reference named "simpleExample.type.schema.json",
            // extract the "simpleExample.type" part as the type name
            if (!refSchema.typeName) {
                var typeName = fileName;
                var indexOfFileExtension = fileName.indexOf(".schema.json");
                if (indexOfFileExtension !== -1) {
                    typeName = fileName.slice(0, indexOfFileExtension);
                }

                if (typeName !== 'descriptor.schema.json' && typeName.startsWith('descriptor.')) {
                    typeName = typeName.substring('descriptor.'.length);
                }

                if (typeName.startsWith('_.ctx.runtime')) typeName = 'CTX' + typeName.substring('_.ctx.runtime'.length);

                refSchema.typeName = typeName;
            }
        }


        return replaceRef(refSchema, searchPaths, ignorableTypes, schemaReferences, schema.title === undefined ? parentTitle : schema.title, root);
    }

    for (var name in schema) {
        if (schema.hasOwnProperty(name)) {
            if (typeof schema[name] === 'object') {
                schema[name] = replaceRef(schema[name], searchPaths, ignorableTypes, schemaReferences,
                  schema.title === undefined ? parentTitle : schema.title, root);
            }
        }
    }

    return schema;
}
