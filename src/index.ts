import { Types, PluginValidateFn, PluginFunction, oldVisit } from '@graphql-codegen/plugin-helpers';
import { concatAST, GraphQLSchema, Kind, FragmentDefinitionNode, DocumentNode, visit } from 'graphql';
import { extname } from 'path';
import {
  LoadedFragment,
  DocumentMode
} from '@graphql-codegen/visitor-plugin-common';
import { TypeScriptDocumentNodesVisitor, TypeScriptDocumentNodesVisitorPluginConfig } from './visitor';

function getUsedFragments(node: DocumentNode): string[] {
  const imports: string[] = [];
  visit(node, {
    leave: {
      FragmentSpread(node) {
        imports.push(node.name.value);
      }
    }
  });
  return imports;
}

function generateFragmentImports(node: DocumentNode, fragmentImportsSourceMap: Record<string, string> = {}): string[] {
  return getUsedFragments(node)
    .filter((fragmentName) => {
      // TODO: instead of assuming all fragments needed exist in the map,
      // look through all fragment definitions in the given document and throw 
      // if there's a used fragment thats not either locally defined or supplied
      // in the fragmentImportsSourceMap
      return !!fragmentImportsSourceMap[fragmentName];
    })
    .map((fragmentName) => {
      // TODO merge imports from same source path into one statement
      return `import { ${fragmentName} } from '${fragmentImportsSourceMap[fragmentName]}';`
    });
}

export const plugin: PluginFunction<TypeScriptDocumentNodesVisitorPluginConfig> = (
  schema: GraphQLSchema,
  rawDocuments: Types.DocumentFile[],
  config: TypeScriptDocumentNodesVisitorPluginConfig
) => {
  // const documents = config.flattenGeneratedTypes ? optimizeOperations(schema, rawDocuments) : rawDocuments;
  const documents = rawDocuments;
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
    prepend: allAst.definitions.length === 0 ? [] : visitor.getImports().concat(generateFragmentImports(allAst, config.fragmentImportsSourceMap)),
    content: [visitor.fragments, ...visitorResult.definitions.filter(t => typeof t === 'string')].join('\n'),
  };
};

export const validate: PluginValidateFn<TypeScriptDocumentNodesVisitorPluginConfig> = async (
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

  if (documents.length > 1) {
    throw new Error(`Plugin "asa-graphql-ts-typed-document" only allows a single document at a time`);
  }
};
