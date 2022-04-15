import { Types } from '@graphql-codegen/plugin-helpers';
import { buildSchema, parse } from 'graphql';
import { plugin } from '../src';
import * as ts from 'typescript';

function findAncestor(node: ts.Node, visitor: (n: ts.Node) => boolean) {
  if (visitor(node)) {
    return true;
  }
  let found = false;
  node.forEachChild((n) => {
    if (!found) {
      found = findAncestor(n, visitor);
    }
  });
  return found;
}

describe('TypedDocumentNode', () => {
  it('Should not output imports when there are no operations at all', async () => {
    const result = (await plugin(null as any, [], {})) as Types.ComplexPluginOutput;
    expect(result.content).toBe('');
    expect(result.prepend.length).toBe(0);
  });

  it('Should not output object literal', async () => {
    const schema = buildSchema(/* GraphQL */ `
      schema {
        query: Query
      }

      type Query {
        jobs: [Job!]!
      }

      type Job {
        id: ID!
        recruiterName: String!
        title: String!
      }
    `);

    const ast = parse(/* GraphQL */ `
      query GetJobs {
        jobs {
          recruiterName
        }
      }
    `);

    const res = (await plugin(
      schema,
      [{ location: '', document: ast }],
      {},
      { outputFile: '' }
    )) as Types.ComplexPluginOutput;

    const node = ts.createSourceFile(
      'plugin-output.ts',
      res.content,
      ts.ScriptTarget.Latest
    );
    expect(findAncestor(node, (n) => ts.SyntaxKind[n.kind] === 'ObjectLiteralExpression')).toBeFalsy();
  });

  it('Should handle custom query type', async () => {
    const schema = buildSchema(/* GraphQL */ `
      schema {
        query: Query
      }

      type Query {
        jobs: [Job!]!
      }

      type Job {
        id: ID!
        recruiterName: String!
        title: String!
      }
    `);

    const ast = parse(/* GraphQL */ `
      query GetJobs {
        jobs {
          recruiterName
        }
      }
    `);

    const res = (await plugin(
      schema,
      [{ location: '', document: ast }],
      { documentTypeImportDirective: 'my-custom-type-module#CustomDocumentNamedImport' },
      { outputFile: '' }
    )) as Types.ComplexPluginOutput;

    expect(res.prepend.length).toEqual(1);
    expect(res.prepend[0]).toEqual("import { CustomDocumentNamedImport as DocumentNode } from 'my-custom-type-module';");
  });

  it('Should work with fragments', async () => {
    const schema = buildSchema(/* GraphQL */ `
      schema {
        query: Query
      }

      type Query {
        jobs: [Job!]!
      }

      type Job {
        id: ID!
        recruiterName: String!
        title: String!
      }
    `);

    const ast = parse(/* GraphQL */ `
      fragment JobFragment on Job {
        recruiterName
      }
      query GetJobs {
        ...JobFragment
      }
    `);

    const res = (await plugin(
      schema,
      [{ location: '', document: ast }],
      {},
      { outputFile: '' }
    )) as Types.ComplexPluginOutput;

    // Should not attempt to import inline fragment
    expect(!!res.prepend.find((s) => s.includes('JobFragment'))).toBe(false);

    expect(res.content).toContain('export type GetJobsDocument');
    expect(res.content).toContain('export const JobFragment');

    const node = ts.createSourceFile(
      'plugin-output.ts',
      res.content,
      ts.ScriptTarget.Latest
    );
    expect(findAncestor(node, (n) => ts.SyntaxKind[n.kind] === 'ObjectLiteralExpression')).toBeFalsy();
  });

  it('Should work with fragment imports via fragmentImportsSourceMap', async () => {
    const schema = buildSchema(/* GraphQL */ `
      schema {
        query: Query
      }

      type Query {
        jobs: [Job!]!
      }

      type Job {
        id: ID!
        recruiterName: String!
        title: String!
      }
    `);

    const ast = parse(/* GraphQL */ `
      #import "./_fragment.graphql"
      query GetJobs {
        ...JobFragment
      }
    `);

    const res = (await plugin(
      schema,
      [ { location: '', document: ast }],
      {
        fragmentImportsSourceMap: {
          JobFragment: './_fragment.graphql'
        }
      },
      { outputFile: '' }
    )) as Types.ComplexPluginOutput;

    expect(res.prepend).toContain(`import { JobFragment } from './_fragment.graphql';`);
  });

  it('Should also produce exported query', async () => {
    const schema = buildSchema(/* GraphQL */ `
      schema {
        query: Query
      }

      type Query {
        jobs: [Job!]!
      }

      type Job {
        id: ID!
        recruiterName: String!
        title: String!
      }
    `);

    const ast = parse(/* GraphQL */ `
      query GetJobs {
        jobs {
          recruiterName
        }
      }
    `);

    const res = (await plugin(
      schema,
      [{ location: 'my/document/file.graphql', document: ast }],
      {},
      { outputFile: '' }
    )) as Types.ComplexPluginOutput;

    const node = ts.createSourceFile(
      'plugin-output.ts',
      res.content,
      ts.ScriptTarget.Latest
    );
    expect(findAncestor(node, (n) => ts.SyntaxKind[n.kind] === 'ObjectLiteralExpression')).toBeFalsy();
    const children = node.getChildAt(0).getChildren();
    expect(children.length).toBe(3);
    expect(ts.SyntaxKind[children[0].kind]).toBe('TypeAliasDeclaration');
    const typeDec = children[0] as ts.TypeAliasDeclaration;
    expect(typeDec.name.escapedText).toEqual('GetJobsDocument');
    expect(ts.SyntaxKind[children[2].kind]).toBe('ExportAssignment');
    expect(((typeDec.type as ts.TypeReferenceNode).typeName as ts.Identifier).escapedText).toEqual('DocumentNode');
    // TODO content assertions
  });
});
