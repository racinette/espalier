import path from "node:path";
import ts from "typescript";

// One retained snapshot per service. No policy or findings are shared.
export function createCompilerService(root, { onBuild = () => {} } = {}) {
  root = path.resolve(root);
  let previousKey;
  let previousAnalysis;
  let disposed = false;

  function analyze({ sources, compilerOptions }) {
    if (disposed) throw new Error("Compiler service is disposed.");
    const entries = [...sources].sort(([a], [b]) => a.localeCompare(b));
    const key = JSON.stringify([entries, compilerOptions]);
    if (key === previousKey) return previousAnalysis;
    const converted = ts.convertCompilerOptionsFromJson(compilerOptions, root);
    if (converted.errors.length) {
      throw new Error(converted.errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"));
    }
    const options = { ...converted.options, noEmit: true };
    const contents = new Map(entries.map(([file, text]) => [path.resolve(root, file), text]));
    const directories = new Set([root]);
    for (const file of contents.keys()) {
      for (let dir = path.dirname(file); dir.startsWith(root); dir = path.dirname(dir)) {
        directories.add(dir);
        if (dir === root) break;
      }
    }
    const libraryRoot = path.dirname(ts.getDefaultLibFilePath(options));
    const dependencyRoot = path.join(root, "node_modules");
    const within = (base, file) => file === base || file.startsWith(base + path.sep);
    const supportPath = (file) => within(libraryRoot, file) || within(dependencyRoot, file);
    const supportFile = (file) => supportPath(file) && (file.endsWith(".d.ts") || path.basename(file) === "package.json");
    const host = ts.createCompilerHost(options);
    // Native reads are limited to compiler/dependency support; application
    // files and settings are supplied by the rule's context snapshot.
    host.getCurrentDirectory = () => root;
    host.readFile = (file) => contents.get(path.resolve(file)) ??
      (supportFile(path.resolve(file)) ? ts.sys.readFile(file) : undefined);
    host.fileExists = (file) => contents.has(path.resolve(file)) ||
      (supportFile(path.resolve(file)) && ts.sys.fileExists(file));
    host.directoryExists = (dir) => directories.has(path.resolve(dir)) ||
      (supportPath(path.resolve(dir)) && ts.sys.directoryExists(dir));
    host.getDirectories = (dir) => supportPath(path.resolve(dir)) ? ts.sys.getDirectories(dir) : [];
    // This bounded example treats paths beneath this repository's node_modules
    // as logical identities, including links used by temporary fixtures.
    host.realpath = (file) => path.resolve(file);
    host.getSourceFile = (file, languageVersion) => {
      const text = host.readFile(file);
      return text === undefined ? undefined : ts.createSourceFile(file, text, languageVersion, true);
    };
    const program = ts.createProgram([...contents.keys()], options, host);
    const checker = program.getTypeChecker();
    // Only immutable facts cross the service boundary; callers cannot mutate
    // the program or leave policy decisions in another rule's state.
    const analysis = Object.freeze({
      exportsOf(file) {
        const source = program.getSourceFile(path.resolve(root, file));
        const symbol = source && checker.getSymbolAtLocation(source);
        return Object.freeze(symbol ? checker.getExportsOfModule(symbol).map((entry) => entry.name).sort() : []);
      },
      declarationOfImport(file, localName) {
        const source = program.getSourceFile(path.resolve(root, file));
        for (const statement of source?.statements ?? []) {
          if (!ts.isImportDeclaration(statement)) continue;
          const bindings = statement.importClause?.namedBindings;
          if (!bindings || !ts.isNamedImports(bindings)) continue;
          const binding = bindings.elements.find((entry) => entry.name.text === localName);
          if (!binding) continue;
          const alias = checker.getSymbolAtLocation(binding.name);
          const symbol = alias && checker.getAliasedSymbol(alias);
          const declaration = symbol?.declarations?.[0];
          if (!declaration) return undefined;
          const origin = declaration.getSourceFile();
          const position = origin.getLineAndCharacterOfPosition(declaration.getStart());
          return Object.freeze({ name: symbol.name, file: origin.fileName,
            line: position.line + 1, column: position.character + 1 });
        }
        return undefined;
      },
      diagnosticsFor(file) {
        const source = program.getSourceFile(path.resolve(root, file));
        if (!source) throw new Error(`Source is outside the snapshot: ${file}`);
        return Object.freeze([
          ...program.getOptionsDiagnostics(),
          ...program.getSyntacticDiagnostics(source),
          ...program.getSemanticDiagnostics(source),
        ].map((item) => {
          const position = item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start) : undefined;
          return Object.freeze({
            code: item.code,
            message: ts.flattenDiagnosticMessageText(item.messageText, "\n"),
            file: item.file?.fileName,
            line: position ? position.line + 1 : undefined,
            column: position ? position.character + 1 : undefined,
          });
        }));
      },
    });
    previousKey = key;
    previousAnalysis = analysis;
    onBuild(); // Test/profiling observer; never changes returned facts.
    return analysis;
  }

  return Object.freeze({
    analyze,
    dispose() {
      previousKey = undefined;
      previousAnalysis = undefined;
      disposed = true;
    },
  });
}
