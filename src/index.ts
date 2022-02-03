import { Types, PluginValidateFn, PluginFunction, oldVisit } from '@graphql-codegen/plugin-helpers';
import { concatAST, GraphQLSchema, Kind, FragmentDefinitionNode } from 'graphql';
import { AsaTypeScriptTypedDocumentNodesConfig } from './config';
import { extname } from 'path';
import {
  LoadedFragment,
  RawClientSideBasePluginConfig,
  DocumentMode,
  optimizeOperations,
} from '@graphql-codegen/visitor-plugin-common';
import { TypeScriptDocumentNodesVisitor } from './visitor';

export const plugin: PluginFunction<AsaTypeScriptTypedDocumentNodesConfig> = (
  schema: GraphQLSchema,
  rawDocuments: Types.DocumentFile[],
  config: AsaTypeScriptTypedDocumentNodesConfig
) => {
  const documents = config.flattenGeneratedTypes ? optimizeOperations(schema, rawDocuments) : rawDocuments;
  const allAst = concatAST(documents.map(v => v.document));

  const allFragments: LoadedFragment[] = [
    ...(allAst.definitions.filter(d => d.kind === Kind.FRAGMENT_DEFINITION) as FragmentDefinitionNode[]).map(
      fragmentDef => ({
        node: fragmentDef,
        name: fragmentDef.name.value,
        onType: fragmentDef.typeCondition.name.value,
        isExternal: false,
      })
    ),
    ...(config.externalFragments || []),
  ];

  const visitor = new TypeScriptDocumentNodesVisitor(schema, allFragments, config, documents);
  const visitorResult = oldVisit(allAst, { leave: visitor });

  return {
    prepend: allAst.definitions.length === 0 ? [] : visitor.getImports(),
    content: [visitor.fragments, ...visitorResult.definitions.filter(t => typeof t === 'string')].join('\n'),
  };
};

export const validate: PluginValidateFn<RawClientSideBasePluginConfig> = async (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  config,
  outputFile: string
) => {
  if (config && config.documentMode === DocumentMode.string) {
    throw new Error(`Plugin "asa-graphql-ts-typed-document" does not allow using 'documentMode: string' configuration!`);
  }

  if (extname(outputFile) !== '.ts' && extname(outputFile) !== '.tsx') {
    throw new Error(`Plugin "asa-graphql-ts-typed-document" requires extension to be ".ts" or ".tsx"!`);
  }
};

export { AsaTypeScriptTypedDocumentNodesConfig };
