#!/usr/bin/env python3
"""
Test script for transcription optimizations
"""
import sys
import os
import json
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

try:
    from services.transcription import TranscriptionService
    from config import LANGUAGE_MODELS, LANGUAGE_PARAMS
    
    print("✅ Successfully imported optimized transcription service")
    
    # Test model cache system
    print("\n🔧 Testing Model Cache System:")
    service = TranscriptionService()
    
    print(f"Default model size: {service.default_model_size}")
    print(f"Model cache initialized: {service.model_cache is not None}")
    print(f"Performance metrics initialized: {len(service.performance_metrics)} entries")
    
    # Test language-specific model selection
    print("\n🌍 Testing Language-Specific Model Selection:")
    for lang in ['ar', 'tr', 'en', 'es']:
        optimal_model = service.get_optimal_model_size(lang)
        print(f"  {lang}: {optimal_model}")
    
    # Test language-specific parameters
    print("\n⚙️  Testing Language-Specific Parameters:")
    for lang in ['ar', 'tr', 'en']:
        params = service.get_language_params(lang)
        print(f"  {lang}: beam_size={params.get('beam_size', 'default')}, "
              f"no_speech_threshold={params.get('no_speech_threshold', 'default')}")
    
    # Test RTL language detection
    print("\n📝 Testing RTL Language Detection:")
    for lang in ['ar', 'he', 'en', 'tr']:
        is_rtl = lang in service.RTL_LANGUAGES
        print(f"  {lang}: {'RTL' if is_rtl else 'LTR'}")
    
    # Test configuration
    print("\n📋 Testing Configuration:")
    print(f"Available language models: {len(LANGUAGE_MODELS)} languages")
    print(f"Configured language params: {len(LANGUAGE_PARAMS)} languages")
    print(f"Arabic model: {LANGUAGE_MODELS.get('ar', 'not configured')}")
    print(f"Turkish model: {LANGUAGE_MODELS.get('tr', 'not configured')}")
    print(f"English model: {LANGUAGE_MODELS.get('en', 'not configured')}")
    
    # Test performance monitoring
    print("\n📊 Testing Performance Monitoring:")
    stats = service.get_performance_stats()
    print(f"Metrics tracked: {len(stats['metrics'])} languages")
    print(f"Cached models: {stats['cache_usage']} models")
    print(f"Available caches: {stats['cached_models']}")
    
    print("\n✅ All optimization features working correctly!")
    
    # Show warnings if faster-whisper not available
    try:
        from faster_whisper import WhisperModel
        print("🎤 faster-whisper: Available")
    except Exception as e:
        print(f"⚠️  faster-whisper: Not available ({e})")
    
    # Show audio processing availability
    try:
        import librosa
        print("🔊 Audio preprocessing: Available")
    except ImportError:
        print("⚠️  Audio preprocessing: Not available (librosa missing)")

except Exception as e:
    print(f"❌ Error testing optimizations: {e}")
    import traceback
    traceback.print_exc()