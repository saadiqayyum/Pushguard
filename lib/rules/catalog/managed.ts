/**
 * JVM, .NET, Ruby and PHP. Different ecosystems, one shared weakness: the build
 * descriptor is a program, and it runs before anybody compiles or reviews.
 */
export const jvm = [
  {
    id: "jvm-build-runs-command",
    description: "A Gradle or Maven build executing a command or fetching code",
    severity: "critical",
    // A Gradle build file is Groovy or Kotlin. It is not configuration.
    paths: ["**/build.gradle", "**/build.gradle.kts", "**/settings.gradle*", "**/pom.xml", "**/*.jenkinsfile"],
    added_lines: "exec\\s*\\{|ProcessBuilder|Runtime\\.getRuntime|\\bexec-maven-plugin|<goal>exec</goal>",
  },
  {
    id: "jvm-repository-changed",
    description: "An artifact repository added or repointed",
    severity: "critical",
    paths: ["**/build.gradle", "**/build.gradle.kts", "**/pom.xml", "**/settings.xml", "**/gradle.properties"],
    added_lines: "maven\\s*\\{|<repository>|<url>http|repositories\\s*\\{",
  },
  {
    id: "jvm-process-execution",
    description: "Process execution or reflective class loading added",
    severity: "high",
    paths: ["**/*.java", "**/*.kt", "**/*.scala", "**/*.groovy"],
    added_lines: "Runtime\\.getRuntime\\(\\)\\.exec|new ProcessBuilder|Class\\.forName|URLClassLoader|defineClass",
    ai: "Is this process execution or reflective class loading a deliberate backdoor, or a legitimate use such as a plugin system, a test harness, or a documented integration? Say what the code actually does if you can tell.",
  },
  {
    id: "jvm-gradle-wrapper-changed",
    description: "The Gradle wrapper jar or its distribution URL changed",
    severity: "critical",
    // gradle-wrapper.jar is a binary that every build executes. Nobody diffs it.
    paths: ["**/gradle/wrapper/**", "**/gradlew", "**/gradlew.bat", "**/mvnw", "**/.mvn/**"],
    change_type: ["added", "modified"],
  },
] as const

export const dotnet = [
  {
    id: "dotnet-build-runs-command",
    description: "An MSBuild target executing a command",
    severity: "critical",
    paths: ["**/*.csproj", "**/*.fsproj", "**/*.vbproj", "**/*.props", "**/*.targets", "**/Directory.Build.*"],
    added_lines: "<Exec |<PreBuildEvent|<PostBuildEvent|DownloadFile",
  },
  {
    id: "dotnet-nuget-source-changed",
    description: "A NuGet package source added or repointed",
    severity: "critical",
    paths: ["**/nuget.config", "**/NuGet.Config", "**/*.nuspec"],
  },
  {
    id: "dotnet-process-execution",
    description: "Process execution or runtime assembly loading added",
    severity: "high",
    paths: ["**/*.cs", "**/*.fs", "**/*.vb"],
    added_lines: "Process\\.Start|Assembly\\.Load|Activator\\.CreateInstance|DllImport",
  },
] as const

export const ruby = [
  {
    id: "ruby-gem-from-source",
    description: "A gem pointing at a git ref, path, or alternate source",
    severity: "critical",
    paths: ["**/Gemfile", "**/*.gemspec"],
    added_lines: "\\bgit:|\\bgithub:|\\bpath:|^\\s*source ",
  },
  {
    id: "ruby-native-extension",
    description: "A native extension, which compiles and runs at gem install",
    severity: "critical",
    paths: ["**/extconf.rb", "**/ext/**/*.rb", "**/Rakefile"],
    added_lines: "create_makefile|\\bsystem\\(|`|%x\\{",
  },
  {
    id: "ruby-dynamic-execution",
    description: "Dynamic execution or shell-out added",
    severity: "high",
    paths: ["**/*.rb", "**/*.rake", "**/*.erb"],
    added_lines: "\\beval\\(|instance_eval|class_eval|Kernel\\.system|Open3\\.|%x\\{|`[^`]*`",
    ai: "Is this dynamic evaluation or shell execution a deliberate backdoor, or ordinary Ruby metaprogramming such as a DSL, a Rake task, or a test helper? Say what the code actually does if you can tell.",
  },
] as const

export const php = [
  {
    id: "php-composer-script",
    description: "A Composer script or plugin, which runs on install",
    severity: "critical",
    paths: ["**/composer.json"],
    added_lines: '"scripts"\\s*:|"post-install-cmd"|"post-autoload-dump"|"repositories"\\s*:',
  },
  {
    id: "php-dynamic-execution",
    description: "Dynamic execution, shell-out, or unserialisation added",
    severity: "critical",
    // The classic PHP webshell surface. `unserialize` on attacker data is
    // object injection, which is code execution by another route.
    paths: ["**/*.php", "**/*.phtml", "**/*.inc"],
    // `preg_replace` with the /e modifier is bounded rather than using `.*`,
    // which backtracks. Backticks are dropped from the alternation: in PHP they
    // are shell execution, but they also appear in every SQL identifier and
    // docblock, and the specific calls above already cover the real cases.
    added_lines:
      "\\beval\\(|\\bassert\\(|\\bsystem\\(|shell_exec\\(|passthru\\(|proc_open\\(|popen\\(|\\bunserialize\\(|create_function\\(|preg_replace\\s*\\(\\s*['\"][^'\"]{0,80}e['\"]",
    ai: "Is this dynamic execution a webshell or backdoor, or a legitimate use such as a template engine or a framework internal? Say what the code actually does if you can tell.",
  },
  {
    id: "php-obfuscated-payload",
    description: "Encoded payload added to PHP source",
    severity: "critical",
    paths: ["**/*.php", "**/*.phtml", "**/*.inc"],
    added_lines: "base64_decode|gzinflate|str_rot13|hex2bin|\\\\x[0-9a-fA-F]{2}\\\\x[0-9a-fA-F]{2}",
  },
] as const
