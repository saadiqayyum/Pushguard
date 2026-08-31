// JVM, .NET, Ruby and PHP. Different ecosystems, one shared weakness: the build
// descriptor is a program, and it runs before anybody compiles or reviews.
export const jvm = [
  {
    id: "jvm-build-runs-command",
    description: "A Gradle or Maven build executing a command or fetching code",
    severity: "critical",
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
  },
  {
    id: "jvm-gradle-wrapper-changed",
    description: "The Gradle wrapper jar or its distribution URL changed",
    severity: "critical",
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
    paths: ["**/*.php", "**/*.phtml", "**/*.inc"],
    added_lines:
      "\\beval\\(|\\bassert\\(|\\bsystem\\(|shell_exec\\(|passthru\\(|proc_open\\(|popen\\(|\\bunserialize\\(|create_function\\(|preg_replace\\s*\\(\\s*['\"][^'\"]{0,80}e['\"]",
  },
  {
    id: "php-obfuscated-payload",
    description: "Encoded payload added to PHP source",
    severity: "critical",
    paths: ["**/*.php", "**/*.phtml", "**/*.inc"],
    added_lines: "base64_decode|gzinflate|str_rot13|hex2bin|\\\\x[0-9a-fA-F]{2}\\\\x[0-9a-fA-F]{2}",
  },
] as const
