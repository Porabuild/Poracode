import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("com.google.gms.google-services") apply false
    // Kotlin is built into AGP 9; these compiler plugins still need an explicit id.
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.10"
    id("org.jetbrains.kotlin.plugin.serialization") version "2.4.10"
}

val googleServicesConfig = layout.projectDirectory.file("google-services.json").asFile
val firebaseConfigured = googleServicesConfig.isFile
if (firebaseConfigured) {
    apply(plugin = "com.google.gms.google-services")
}

val mobileBuildNumber = (System.getenv("PORACODE_MOBILE_BUILD_NUMBER") ?: "1").toInt()
val mobileVersionName = System.getenv("PORACODE_MOBILE_VERSION_NAME") ?: "1.5.0"
val remoteV3NativeDirectory =
    rootProject.layout.projectDirectory.dir("../protocol/remote/v3/generated/native")
val remoteV3KotlinDirectory = remoteV3NativeDirectory.dir("kotlin")
val remoteV3BindingsManifest = remoteV3NativeDirectory.file("native-bindings.json")

android {
    namespace = "com.poracode.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.lightcodeapp.mobile"
        minSdk = 26
        targetSdk = 37
        versionCode = mobileBuildNumber
        versionName = mobileVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        testInstrumentationRunnerArguments["clearPackageData"] = "true"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
        debug {
            // Keep applicationId com.lightcodeapp.mobile (no suffix) for pairing deep links.
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    defaultConfig {
        buildConfigField("boolean", "FIREBASE_PUSH_CONFIGURED", firebaseConfigured.toString())
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    testOptions {
        execution = "ANDROIDX_TEST_ORCHESTRATOR"
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }

    // Consume root protocol fixtures directly (no duplicated copies under android/).
    sourceSets {
        getByName("main") {
            kotlin.directories.add(remoteV3KotlinDirectory.asFile.absolutePath)
        }
        getByName("test") {
            resources.directories.add(
                rootProject.projectDir.resolve("../protocol/remote/v3").absolutePath,
            )
        }
    }

}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.08.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material3.adaptive:adaptive:1.3.0")
    implementation("androidx.compose.material3.adaptive:adaptive-layout:1.3.0")
    implementation("androidx.compose.material3.adaptive:adaptive-navigation:1.3.0")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.core:core-ktx:1.19.0")
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation("androidx.datastore:datastore-preferences:1.2.1")

    // Session-driven screens + adaptive master/detail (no Navigation graph for this slice).
    // Navigation 3 is stable, but simple state navigation matches the iOS client and keeps deps minimal.

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

    implementation("com.squareup.okhttp3:okhttp:5.4.0")

    // Pairing QR scanner. The bundled ML Kit barcode model is used deliberately:
    // the Play-Services variant would fail on devices/emulators without Play Services.
    implementation("androidx.camera:camera-core:1.6.1")
    implementation("androidx.camera:camera-camera2:1.6.1")
    implementation("androidx.camera:camera-lifecycle:1.6.1")
    implementation("androidx.camera:camera-view:1.6.1")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")

    implementation(platform("com.google.firebase:firebase-bom:34.16.0"))
    implementation("com.google.firebase:firebase-messaging")
    // FCM's Play Services edge still requests Fragment 1.1.0; Activity Result APIs require 1.3+.
    implementation("androidx.fragment:fragment:1.8.9")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:5.4.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    testImplementation("org.json:json:20250517")

    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:rules:1.7.0")
    androidTestImplementation("androidx.test:core-ktx:1.7.0")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.4.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestUtil("androidx.test:orchestrator:1.6.1")
}

tasks.register("verifyFirebaseConfiguration") {
    group = "verification"
    description = "Verifies that Firebase is enabled only by a real injected google-services.json."
    doLast {
        check(firebaseConfigured == plugins.hasPlugin("com.google.gms.google-services")) {
            "Google Services plugin/config activation is inconsistent"
        }
        if (firebaseConfigured) {
            check(googleServicesConfig.length() > 2L) { "google-services.json is empty" }
        }
    }
}

val verifyRemoteV3NativeBindings = tasks.register("verifyRemoteV3NativeBindings") {
    group = "verification"
    description = "Verifies generated remote-v3 Kotlin sources and compatibility versions."
    inputs.file(remoteV3BindingsManifest)
    inputs.dir(remoteV3KotlinDirectory)
    doLast {
        val configuredMainKotlinDirectories = android.sourceSets.getByName("main").kotlin.directories
        check(remoteV3KotlinDirectory.asFile.absolutePath in configuredMainKotlinDirectories) {
            "Generated remote-v3 Kotlin directory is not in the main source set"
        }
        val manifestFile = remoteV3BindingsManifest.asFile
        check(manifestFile.isFile) { "Missing generated native binding manifest: $manifestFile" }
        @Suppress("UNCHECKED_CAST")
        val manifest = JsonSlurper().parse(manifestFile) as Map<String, Any?>
        fun version(name: String, expected: Int) {
            val actual = (manifest[name] as? Number)?.toInt()
            check(actual == expected) {
                "Incompatible remote-v3 $name: expected $expected, found $actual"
            }
        }
        version("protocolVersion", 8)
        version("bindingFormatVersion", 2)
        version("generatorVersion", 3)
        version("formatVersion", 1)

        val languages = manifest["languages"] as? Map<*, *>
            ?: error("native-bindings.json is missing languages")
        val kotlin = languages["kotlin"] as? Map<*, *>
            ?: error("native-bindings.json is missing languages.kotlin")
        val files = kotlin["files"] as? List<*>
            ?: error("native-bindings.json is missing languages.kotlin.files")
        val declared = files.map { entry ->
            val path = (entry as? Map<*, *>)?.get("path") as? String
                ?: error("Kotlin manifest entry is missing path")
            check(path.startsWith("kotlin/") && !path.contains("..")) {
                "Invalid generated Kotlin path: $path"
            }
            path
        }.toSet()
        check(declared.size == files.size) { "Duplicate generated Kotlin paths in manifest" }

        val actual = remoteV3KotlinDirectory.asFile.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .map { "kotlin/${it.relativeTo(remoteV3KotlinDirectory.asFile).invariantSeparatorsPath}" }
            .toSet()
        val missing = declared - actual
        val extra = actual - declared
        check(missing.isEmpty() && extra.isEmpty()) {
            buildString {
                append("Generated Kotlin sources do not match native-bindings.json")
                if (missing.isNotEmpty()) append("\nMissing: ${missing.sorted().joinToString()}")
                if (extra.isNotEmpty()) append("\nExtra: ${extra.sorted().joinToString()}")
            }
        }
    }
}

tasks.named("preBuild").configure {
    dependsOn("verifyFirebaseConfiguration", verifyRemoteV3NativeBindings)
}
