import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Modal,
  Linking,
} from 'react-native';
import {
  GhaSpringCloudGatewayAdapter,
  LandingCategory,
  MobileLandingSection,
} from './src/api/eventGatewayClient';

const CATEGORIES: Array<{ code: 'ALL' | LandingCategory; label: string }> = [
  { code: 'ALL', label: 'All' },
  { code: 'CME', label: 'CME' },
  { code: 'GSI', label: 'GSI' },
  { code: 'AHS', label: 'Course / AHS' },
  { code: 'Conference', label: 'Conference' },
];

const gatewayClient = new GhaSpringCloudGatewayAdapter();

export default function App() {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | LandingCategory>('ALL');
  const [sections, setSections] = useState<MobileLandingSection[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [imageIndices, setImageIndices] = useState<Record<string, number>>({});
  const [inAppBrowserSection, setInAppBrowserSection] = useState<MobileLandingSection | null>(
    null
  );

  const loadPublishedSections = async () => {
    try {
      const catParam = selectedCategory === 'ALL' ? undefined : selectedCategory;
      const publishedOnly = await gatewayClient.fetchPublishedLandingSections(catParam);
      setSections(publishedOnly);
    } catch (err) {
      console.error('[GHA-MOBILE] Error loading published landing sections:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadPublishedSections();
  }, [selectedCategory]);

  const cycleSectionImage = (sectionId: string, totalImages: number) => {
    if (totalImages <= 1) return;
    setImageIndices((prev) => ({
      ...prev,
      [sectionId]: ((prev[sectionId] || 0) + 1) % totalImages,
    }));
  };

  /**
   * Redirects to section.url inside the In-App Browser when the user taps the section image.
   * Compatible with react-native-inappbrowser-reborn / expo-web-browser / WebView modal.
   */
  const handleImagePressRedirect = (section: MobileLandingSection) => {
    if (section.url && section.url.trim()) {
      setInAppBrowserSection(section);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* App Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Global Health Academy</Text>
        <Text style={styles.headerSubtitle}>CME · GSI · Course / AHS · Conferences</Text>
      </View>

      {/* Category Filter Tabs */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.code;
            return (
              <TouchableOpacity
                key={cat.code}
                onPress={() => setSelectedCategory(cat.code)}
                style={[styles.filterTab, active && styles.filterTabActive]}
              >
                <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Published Sections Feed */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#0f172a" />
        </View>
      ) : (
        <ScrollView
          style={styles.feed}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadPublishedSections();
              }}
            />
          }
        >
          {sections.map((section) => {
            const imgs =
              section.images && section.images.length > 0
                ? section.images
                : [
                    {
                      blobPath: section.imageBlobPath,
                      fileName: 'banner.jpg',
                      mimeType: 'image/jpeg',
                      sizeBytes: 0,
                    },
                  ];
            const activeIdx = (imageIndices[section.id] || 0) % imgs.length;
            const currentBlobPath = imgs[activeIdx].blobPath;

            return (
              <View key={section.id} style={styles.card}>
                {/* Tapping the image redirects to section.url in the In-App Browser */}
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => handleImagePressRedirect(section)}
                >
                  <Image
                    source={{ uri: gatewayClient.resolveBlobImageUrl(currentBlobPath) }}
                    style={styles.cardImage}
                    resizeMode="cover"
                  />
                  <View style={styles.urlBadge}>
                    <Text style={styles.urlBadgeText}>Tap image to open link</Text>
                  </View>
                  {imgs.length > 1 && (
                    <TouchableOpacity
                      style={styles.imageCounter}
                      onPress={() => cycleSectionImage(section.id, imgs.length)}
                    >
                      <Text style={styles.imageCounterText}>
                        {activeIdx + 1} / {imgs.length} (Next Image →)
                      </Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                <View style={styles.cardBody}>
                  <Text style={styles.metaText}>
                    {section.eventYear} ·{' '}
                    {section.category === 'AHS' ? 'Course / AHS' : section.category}
                  </Text>
                  <Text style={styles.cardTitle}>{section.title}</Text>
                  <Text style={styles.cardDescription}>{section.description}</Text>
                  {Boolean(section.url) && (
                    <TouchableOpacity
                      onPress={() => handleImagePressRedirect(section)}
                      style={styles.linkRow}
                    >
                      <Text style={styles.linkText} numberOfLines={1}>
                        {section.url}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* In-App Browser Modal (Opens section.url when user taps landing page image) */}
      <Modal
        visible={Boolean(inAppBrowserSection)}
        animationType="slide"
        onRequestClose={() => setInAppBrowserSection(null)}
      >
        <SafeAreaView style={styles.browserContainer}>
          <View style={styles.browserToolbar}>
            <TouchableOpacity
              onPress={() => setInAppBrowserSection(null)}
              style={styles.browserDoneButton}
            >
              <Text style={styles.browserDoneText}>Done</Text>
            </TouchableOpacity>
            <View style={styles.browserAddressBar}>
              <Text style={styles.browserAddressText} numberOfLines={1}>
                {inAppBrowserSection?.url}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (inAppBrowserSection?.url) {
                  Linking.openURL(inAppBrowserSection.url);
                }
              }}
              style={styles.browserExternalButton}
            >
              <Text style={styles.browserExternalText}>Open</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.browserBody}>
            <Text style={styles.browserCategoryBadge}>
              {inAppBrowserSection?.category} · {inAppBrowserSection?.eventYear}
            </Text>
            <Text style={styles.browserPageTitle}>{inAppBrowserSection?.title}</Text>
            <Text style={styles.browserPageDesc}>{inAppBrowserSection?.description}</Text>
            <Text style={styles.browserUrlNote}>
              Loaded inside GHA In-App Browser: {inAppBrowserSection?.url}
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#0f172a', paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  filterBar: { backgroundColor: '#f1f5f9', paddingVertical: 10, paddingHorizontal: 12 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, marginRight: 8 },
  filterTabActive: { backgroundColor: '#0f172a' },
  filterTabText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  filterTabTextActive: { color: '#ffffff' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  feed: { flex: 1, padding: 16 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardImage: { width: '100%', height: 190, backgroundColor: '#0f172a' },
  urlBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  urlBadgeText: { color: '#6ee7b7', fontSize: 11, fontFamily: 'monospace' },
  imageCounter: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  imageCounterText: { color: '#ffffff', fontSize: 11, fontFamily: 'monospace' },
  cardBody: { padding: 14 },
  metaText: { fontSize: 11, fontWeight: '600', color: '#475569', marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  cardDescription: { fontSize: 13, color: '#475569', lineHeight: 19 },
  linkRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  linkText: { fontSize: 11, color: '#0369a1', fontFamily: 'monospace' },
  browserContainer: { flex: 1, backgroundColor: '#ffffff' },
  browserToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  browserDoneButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  browserDoneText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  browserAddressBar: {
    flex: 1,
    marginHorizontal: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  browserAddressText: { fontSize: 11, color: '#334155', fontFamily: 'monospace' },
  browserExternalButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#0f172a',
    borderRadius: 6,
  },
  browserExternalText: { fontSize: 12, fontWeight: '600', color: '#ffffff' },
  browserBody: { padding: 20 },
  browserCategoryBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
    marginBottom: 6,
  },
  browserPageTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 10 },
  browserPageDesc: { fontSize: 14, color: '#475569', lineHeight: 21, marginBottom: 16 },
  browserUrlNote: { fontSize: 11, color: '#64748b', fontFamily: 'monospace' },
});
