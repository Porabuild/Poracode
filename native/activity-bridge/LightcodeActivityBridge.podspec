require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# CocoaPods path (the default for `cap add ios`). Capacitor's generated Podfile
# references this podspec via the plugin's package.json `capacitor.ios` entry.
# The Swift Package Manager path lives in Package.swift; both compile the same
# sources under ios/Sources.
Pod::Spec.new do |s|
  s.name = 'LightcodeActivityBridge'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://github.com/SDSLeon/lightcode'
  s.author = package['author']
  s.source = { :git => 'https://github.com/SDSLeon/lightcode.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
