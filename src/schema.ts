import * as Ajv from 'ajv';
import * as _ from 'lodash';
import { outputFile } from 'fs-extra';
import { join, basename, extname } from 'path';
import { ConfigObject, ConfigSource, LoadedConfig, loadConfig, loadConfigSync } from './config';
import { metaProps } from './meta';
import {
  FileType,
  findParseableFile,
  findParseableFileSync,
  parseFile,
  parseFileSync,
} from './file-loader';

const schemaFileNames = ['.app-config.schema', 'app-config.schema'];

export enum InvalidConfig {
  InvalidSchema,
  SecretInNonSecrets,
  SchemaValidation,
}

export type ConfigInput = { schema: ConfigObject } & LoadedConfig;

export const loadSchema = async (cwd = process.cwd()): Promise<ConfigObject> => {
  const schema = await findParseableFile(schemaFileNames.map(f => join(cwd, f)));

  if (!schema) {
    throw new Error('Could not find app config schema.');
  }

  return schema[1];
};

export const loadSchemaSync = (cwd = process.cwd()): ConfigObject => {
  const schema = findParseableFileSync(schemaFileNames.map(f => join(cwd, f)));

  if (!schema) {
    throw new Error('Could not find app config schema.');
  }

  return schema[1];
};

export const validate = (input: ConfigInput, cwd = process.cwd()): [InvalidConfig, Error] | false  => {
  const {
    source,
    config,
    secrets,
    nonSecrets,
  } = input;

  const extractExternalSchemas = (schema: ConfigObject, schemas: any = {}) => {
    if (schema && typeof schema === 'object') {
      Object.entries(schema).forEach(([key, val]) => {
        if (key === '$ref' && typeof val === 'string') {
          // parse out "filename.json" from "filename.json#/Defs/ServerConfig"
          const [_, filepath] = val.match(/^([^#]*)#?/)!;

          if (filepath) {
            const [_, schema] = parseFileSync(join(cwd, filepath)) as [FileType, any];

            if (!schema.$id) {
              schema.$id = filepath;
            }

            schemas[filepath] = schema;
          }
        } else {
          extractExternalSchemas(val, schemas);
        }
      });
    }

    return schemas;
  };

  // rips out any URIs under $ref keys
  const schemas = extractExternalSchemas(input.schema);

  const ajv = new Ajv({
    allErrors: true,
    schemas: Object.values(schemas),
  });

  // array of property paths that should only be present in secrets file
  const schemaSecrets: string[] = [];

  ajv.addKeyword('secret', {
    validate(schema: any, data: any, parentSchema?: object, dataPath?: string) {
      if (!dataPath) {
        return false;
      }

      const [_, ...key] = dataPath.split('.');
      schemaSecrets.push(key.join('.'));

      return schema === true;
    },
  });

  const schema = input.schema as { [key: string]: ConfigObject };

  if (typeof schema !== 'object') {
    return [InvalidConfig.InvalidSchema, new Error('schema was not an object')];
  }

  if (!schema.$schema) {
    // default to draft 07
    schema.$schema = 'http://json-schema.org/draft-07/schema#';
  }

  const validate = ajv.compile(schema);
  const valid = validate(config);

  if (source === ConfigSource.File && nonSecrets) {
    // check that the nonSecrets does not contain any properties marked as secret
    const secretsInNonSecrets = schemaSecrets.filter((secret) => {
      if (_.get(nonSecrets, secret)) {
        return secret;
      }
    });

    if (secretsInNonSecrets.length > 0) {
      return [
        InvalidConfig.SecretInNonSecrets,
        new Error(
          `Found ${secretsInNonSecrets.map(s => `'.${s}'`).join(', ')} in non secrets file`,
        ),
      ];
    }
  }

  if (!valid) {
    const err = new Error(
      `Config is invalid: ${ajv.errorsText(validate.errors, { dataVar: 'config' })}`,
    );

    err.stack = undefined;

    return [InvalidConfig.SchemaValidation, err];
  }

  return false;
};

export const loadValidated = async (cwd = process.cwd()) => {
  const loaded = await loadConfig(cwd);
  const schema = await loadSchema(cwd);

  const validation = await validate({ schema, ...loaded }, cwd);

  if (validation) {
    throw validation[1];
  }

  return loaded;
};

export const loadValidatedSync = (cwd = process.cwd()) => {
  const loaded = loadConfigSync(cwd);
  const schema = loadSchemaSync(cwd);

  const validation = validate({ schema, ...loaded }, cwd);

  if (validation) {
    throw validation[1];
  }

  return loaded;
};
