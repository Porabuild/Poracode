import org.gradle.api.attributes.Bundling
import org.gradle.api.attributes.Category
import org.gradle.api.attributes.LibraryElements
import org.gradle.api.attributes.Usage
import org.gradle.api.attributes.java.TargetJvmEnvironment

// Root build file — plugin versions are resolved via pluginManagement in settings.gradle.kts.
plugins {
    id("com.android.application") version "9.3.1" apply false
    id("com.google.gms.google-services") version "4.5.0" apply false
}

// Pin the command-line Apply Changes implementation explicitly. Gradle owns
// resolution/caching, so native development does not depend on an Android
// Studio installation or an unpinned executable copied from one.
val androidApkDeployer by configurations.creating {
    isCanBeConsumed = false
    isCanBeResolved = true
    attributes {
        attribute(Usage.USAGE_ATTRIBUTE, objects.named(Usage.JAVA_RUNTIME))
        attribute(Category.CATEGORY_ATTRIBUTE, objects.named(Category.LIBRARY))
        attribute(LibraryElements.LIBRARY_ELEMENTS_ATTRIBUTE, objects.named(LibraryElements.JAR))
        attribute(Bundling.BUNDLING_ATTRIBUTE, objects.named(Bundling.EXTERNAL))
        attribute(
            TargetJvmEnvironment.TARGET_JVM_ENVIRONMENT_ATTRIBUTE,
            objects.named(TargetJvmEnvironment.STANDARD_JVM),
        )
    }
}

dependencies {
    androidApkDeployer("com.android.tools.apkdeployer:apkdeployer:9.4.0-alpha08")
}

val compileAndroidDeployerLauncher by tasks.registering(JavaCompile::class) {
    source(layout.projectDirectory.file("gradle/poracode/PoracodeAndroidDeployer.java"))
    classpath = androidApkDeployer
    destinationDirectory.set(layout.buildDirectory.dir("classes/android-deployer-launcher"))
    sourceCompatibility = JavaVersion.VERSION_21.toString()
    targetCompatibility = JavaVersion.VERSION_21.toString()
    options.release.set(21)
}

tasks.register<JavaExec>("androidApkDeployer") {
    group = "poracode development"
    description = "Runs the pinned Android APK deployer for native development."
    dependsOn(":app:assembleDebug", compileAndroidDeployerLauncher)
    classpath(compileAndroidDeployerLauncher.map { it.destinationDirectory }, androidApkDeployer)
    mainClass.set("com.poracode.build.PoracodeAndroidDeployer")

    doFirst {
        val command = providers.gradleProperty("poracode.android.deployer.command").orNull
            ?: error("poracode.android.deployer.command is required")
        val serial = providers.gradleProperty("poracode.android.deployer.serial").orNull
            ?: error("poracode.android.deployer.serial is required")
        val adb = providers.gradleProperty("poracode.android.deployer.adb").orNull
            ?: error("poracode.android.deployer.adb is required")
        val apk = project(":app").layout.buildDirectory
            .file("outputs/apk/debug/app-debug.apk")
            .get()
            .asFile

        args(
            command,
            "--device=$serial",
            "--adb=$adb",
            "--log-level=INFO",
            "com.lightcodeapp.mobile",
            apk.absolutePath,
        )
        systemProperty(
            "poracode.android.deployer.cache",
            layout.buildDirectory.dir("android-deployer-cache").get().asFile.absolutePath,
        )
    }
}
