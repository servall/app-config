import { join, dirname, extname } from 'path';
import { pathExists } from 'fs-extra';
import { isObject } from '@app-config/utils';
import { ParsingExtension, Root } from '@app-config/core';
import { FileSource } from '@app-config/node';
import { logger } from '@app-config/logging';

/** V1 app-config compatibility */
export default function v1Compat(): ParsingExtension {
  return (value, [[_, key], ...parents]) => {
    // only apply in top-level app-config property
    if (parents[parents.length - 1]?.[0] !== Root) {
      return false;
    }

    if (key === 'app-config' && isObject(value)) {
      return async (parse, _, ctx) => {
        if (ctx instanceof FileSource) {
          logger.warn(
            `Using V1 compatibility layer for special 'app-config' property in ${ctx.filePath}! This functionality is deprecated and may be removed in the future.`,
          );
        } else {
          logger.warn(
            `Using V1 compatibility layer for special 'app-config' property! This functionality is deprecated and may be removed in the future.`,
          );
        }

        const resolveAmbiguousFilename = async (filepath: string) => {
          let resolvedPath = filepath;

          // resolve filepaths that are relative to the current FileSource
          if (ctx instanceof FileSource) {
            resolvedPath = join(dirname(ctx.filePath), filepath);
          }

          switch (extname(resolvedPath)) {
            case '.yml':
            case '.yaml':
            case '.json':
            case '.json5':
            case '.toml':
              return resolvedPath;
            default: {
              if (await pathExists(`${resolvedPath}.yml`)) return `${resolvedPath}.yml`;
              if (await pathExists(`${resolvedPath}.yaml`)) return `${resolvedPath}.yaml`;
              if (await pathExists(`${resolvedPath}.json`)) return `${resolvedPath}.json`;
              if (await pathExists(`${resolvedPath}.json5`)) return `${resolvedPath}.json5`;
              if (await pathExists(`${resolvedPath}.toml`)) return `${resolvedPath}.toml`;

              return resolvedPath;
            }
          }
        };

        // TODO: multiple properties defined

        if ('extends' in value) {
          return parse(
            { $extends: await resolveAmbiguousFilename(value.extends as string) },
            { shouldMerge: true },
          );
        }

        if ('extendsOptional' in value) {
          return parse(
            {
              $extends: {
                path: await resolveAmbiguousFilename(value.extendsOptional as string),
                optional: true,
              },
            },
            { shouldMerge: true },
          );
        }

        if ('override' in value) {
          return parse(
            { $override: await resolveAmbiguousFilename(value.override as string) },
            { shouldOverride: true },
          );
        }

        if ('overrideOptional' in value) {
          return parse(
            {
              $override: {
                path: await resolveAmbiguousFilename(value.overrideOptional as string),
                optional: true,
              },
            },
            { shouldOverride: true },
          );
        }

        return parse(value);
      };
    }

    return false;
  };
}
